import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnalytics, fitWeightedTrend, recomputeTrend } from './analytics';
import { openDb, type DB } from './db/index';
import { migrate } from './db/migrate';
import { getSettings, setSettings } from './settings';
import { seedDefaults } from './seed';
import { addDaysStr, todayStr } from './util';

function freshDb(): DB {
  const db = openDb(':memory:');
  migrate(db);
  seedDefaults(db);
  return db;
}

function seedWeights(db: DB, entries: { date: string; lb: number }[]): void {
  const ins = db.prepare("INSERT INTO weight_entries (entry_date, weight_lb, created_at, updated_at) VALUES (?,?,datetime('now'),datetime('now'))");
  for (const e of entries) ins.run(e.date, e.lb);
  recomputeTrend(db);
}

function seedIntake(db: DB, days: { date: string; kcal: number }[]): void {
  const ins = db.prepare(
    "INSERT INTO food_log (day_date,meal_slot,name,grams,kcal,protein,carb,fat,sort_order,eating_out,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))",
  );
  for (const d of days) ins.run(d.date, 'dinner', 'meal', 100, d.kcal, 20, 20, 10, 1, 0);
}

test('fitWeightedTrend recovers the slope of clean linear data', () => {
  const pts = Array.from({ length: 10 }, (_, i) => ({ t: i * 7, y: 200 - 0.1 * i * 7 }));
  const fit = fitWeightedTrend(pts, 63)!;
  assert.ok(Math.abs(fit.slope - -0.1) < 1e-9);
  assert.ok(Math.abs(fit.value - (200 - 6.3)) < 1e-9);
  assert.ok(fit.sigmaSlope < 1e-9);
});

test('fitWeightedTrend stays near the true slope under zigzag noise', () => {
  const pts = Array.from({ length: 12 }, (_, i) => ({ t: i * 7, y: 200 - 0.1 * i * 7 + (i % 2 === 0 ? 0.8 : -0.8) }));
  const fit = fitWeightedTrend(pts, 77)!;
  assert.ok(Math.abs(fit.slope - -0.1) < 0.03, `slope ${fit.slope}`);
  assert.ok(fit.sigmaSlope > 0);
});

test('fitWeightedTrend edge cases: n<2 and zero spread are null; n=2 is exact', () => {
  assert.equal(fitWeightedTrend([], 0), null);
  assert.equal(fitWeightedTrend([{ t: 0, y: 200 }], 0), null);
  assert.equal(fitWeightedTrend([{ t: 5, y: 200 }, { t: 5, y: 199 }], 5), null);
  const two = fitWeightedTrend([{ t: 0, y: 200 }, { t: 7, y: 198 }], 7)!;
  assert.ok(Math.abs(two.slope - -2 / 7) < 1e-9);
  assert.equal(two.sigmaSlope, 0); // exact fit below n=3 — gate on n upstream
});

test('recomputeTrend follows real change within days, not months', () => {
  const db = freshDb();
  const today = todayStr();
  // weekly weigh-ins losing ~1 lb/week
  seedWeights(db, Array.from({ length: 8 }, (_, i) => ({ date: addDaysStr(today, -7 * (7 - i)), lb: 207 - i })));
  const rows = db.prepare('SELECT entry_date, weight_lb, trend_lb FROM weight_entries ORDER BY entry_date ASC').all() as { weight_lb: number; trend_lb: number }[];
  const last = rows[rows.length - 1];
  // the old EWMA sat ~3-4 lb behind after 8 weekly entries; regression should be within 1 lb
  assert.ok(Math.abs(last.trend_lb - last.weight_lb) < 1, `trend ${last.trend_lb} vs raw ${last.weight_lb}`);
  // single entry trend equals raw
  const db2 = freshDb();
  seedWeights(db2, [{ date: today, lb: 180 }]);
  assert.equal((db2.prepare('SELECT trend_lb FROM weight_entries').get() as { trend_lb: number }).trend_lb, 180);
  db.close();
  db2.close();
});

test('rate needs 3 weigh-ins; TDEE needs 14 logged days AND 4 weigh-ins, with progress counts', () => {
  const db = freshDb();
  const today = todayStr();
  seedWeights(db, [
    { date: addDaysStr(today, -7), lb: 200 },
    { date: today, lb: 199 },
  ]);
  let a = buildAnalytics(db, getSettings(db), today);
  assert.equal(a.weight.lbs_per_week, null);
  assert.ok(a.progress && a.progress.weighins_needed === 2);

  // 14 logged days + only 3 weigh-ins → needs_more_weighins
  seedIntake(db, Array.from({ length: 14 }, (_, i) => ({ date: addDaysStr(today, -i), kcal: 1700 })));
  seedWeights(db, [{ date: addDaysStr(today, -14), lb: 201 }]);
  a = buildAnalytics(db, getSettings(db), today);
  assert.equal(a.tdee.estimate, null);
  assert.equal(a.tdee.reason, 'needs_more_weighins');
  assert.equal(a.progress?.weighins_needed, 1);
  assert.ok(a.weight.lbs_per_week != null, 'rate appears at 3 weigh-ins');
  db.close();
});

test('full data: TDEE ≈ intake − slope·3500 with a band; projection is clamped and banded', () => {
  const db = freshDb();
  const today = todayStr();
  // ~0.5 lb/week loss, 1700 kcal/day for 3 weeks → TDEE ≈ 1700 + 250 = ~1950
  seedWeights(
    db,
    Array.from({ length: 6 }, (_, i) => ({ date: addDaysStr(today, -7 * (5 - i)), lb: 200 - 0.5 * i })),
  );
  seedIntake(db, Array.from({ length: 21 }, (_, i) => ({ date: addDaysStr(today, -i), kcal: 1700 })));
  setSettings(db, { weight_target_lb: 150 });
  const a = buildAnalytics(db, getSettings(db), today);
  assert.ok(a.tdee.estimate != null && Math.abs(a.tdee.estimate - 1950) < 60, `tdee ${a.tdee.estimate}`);
  assert.ok(a.tdee.low! <= a.tdee.estimate! && a.tdee.estimate! <= a.tdee.high!);
  assert.equal(a.progress, null);
  assert.ok(a.goal.eta_confidence != null);
  for (const p of a.projection) {
    assert.ok(p.low <= p.weight && p.weight <= p.high, 'band ordering');
    assert.ok(p.weight >= 150, 'clamped at target');
  }
  // pace decays: second 90 days lose less than the first 90
  const w0 = a.projection[0].weight;
  const w90 = a.projection.find((p) => p.date === addDaysStr(today, 90))!.weight;
  const w180 = a.projection[a.projection.length - 1].weight;
  assert.ok(w0 - w90 >= w90 - w180 - 1e-9, 'adaptation slows the pace');
  db.close();
});
