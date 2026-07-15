import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCycleSummary, cyclePrompt } from './cycle';
import { openDb, type DB } from './db/index';
import { migrate } from './db/migrate';
import { seedDefaults } from './seed';
import { addDaysStr } from './util';

function freshDb(): DB {
  const db = openDb(':memory:');
  migrate(db);
  seedDefaults(db);
  return db;
}

function seedCycles(db: DB, entries: { start: string; end?: string | null; estimated?: boolean }[]): void {
  const ins = db.prepare(
    "INSERT INTO cycle_entries (start_date, end_date, estimated, created_at, updated_at) VALUES (?,?,?,datetime('now'),datetime('now'))",
  );
  for (const e of entries) ins.run(e.start, e.end ?? null, e.estimated ? 1 : 0);
}

/** n periods of `cycleLen`-day cycles and `duration` days each, ending with a start at `lastStart`. */
function regular(lastStart: string, n: number, cycleLen = 28, duration = 6): { start: string; end: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const start = addDaysStr(lastStart, -cycleLen * (n - 1 - i));
    return { start, end: addDaysStr(start, duration - 1) };
  });
}

test('cold start: fewer than 3 starts gives nulls and a reason', () => {
  const db = freshDb();
  seedCycles(db, regular('2030-03-01', 2));
  const s = buildCycleSummary(db, '2030-03-10');
  assert.equal(s.reason, 'need_more_cycles');
  assert.equal(s.predicted_start, null);
  assert.equal(s.is_late, false);
  assert.equal(cyclePrompt(s, '2030-03-10'), null);
  // durations still reported — they don't need gaps
  assert.equal(s.avg_duration_days, 6);
  db.close();
});

test('clean 28-day cycles: prediction, concern floor (+3), confidence by n', () => {
  const db = freshDb();
  seedCycles(db, regular('2030-03-01', 4)); // 3 gaps → medium
  let s = buildCycleSummary(db, '2030-03-05');
  assert.equal(s.avg_cycle_days, 28);
  assert.equal(s.cycle_std_days, 0);
  assert.equal(s.predicted_start, '2030-03-29');
  assert.equal(s.concern_date, '2030-04-01'); // σ=0 → +3 floor
  assert.equal(s.confidence, 'medium');
  const db2 = freshDb();
  seedCycles(db2, regular('2030-03-01', 7)); // 6 gaps → high
  s = buildCycleSummary(db2, '2030-03-05');
  assert.equal(s.confidence, 'high');
  db.close();
  db2.close();
});

test('noisy gaps widen the concern buffer to 2σ', () => {
  const db = freshDb();
  // starts with gaps 24, 32, 24, 32 → mean 28, sample std ~4.62 → buffer ceil(2σ) = 10
  const starts = ['2030-01-01', '2030-01-25', '2030-02-26', '2030-03-22', '2030-04-23'];
  seedCycles(db, starts.map((start) => ({ start, end: addDaysStr(start, 5) })));
  const s = buildCycleSummary(db, '2030-05-01');
  assert.equal(s.avg_cycle_days, 28);
  assert.equal(s.predicted_start, '2030-05-21');
  assert.equal(s.concern_date, '2030-05-31');
  db.close();
});

test('is_late flips only after the concern date, and never while a period is open', () => {
  const db = freshDb();
  seedCycles(db, regular('2030-03-01', 4)); // predicted 03-29, concern 04-01
  assert.equal(buildCycleSummary(db, '2030-04-01').is_late, false);
  assert.equal(buildCycleSummary(db, '2030-04-02').is_late, true);
  seedCycles(db, [{ start: '2030-04-02' }]); // open period
  assert.equal(buildCycleSummary(db, '2030-04-05').is_late, false);
  db.close();
});

test('prompt states: start on/after predicted day; end near usual duration; open suppresses start', () => {
  const db = freshDb();
  seedCycles(db, regular('2030-03-01', 4, 28, 6)); // predicted 03-29
  assert.equal(cyclePrompt(buildCycleSummary(db, '2030-03-28'), '2030-03-28'), null);
  assert.equal(cyclePrompt(buildCycleSummary(db, '2030-03-29'), '2030-03-29'), 'start');
  assert.equal(cyclePrompt(buildCycleSummary(db, '2030-04-10'), '2030-04-10'), 'start');
  seedCycles(db, [{ start: '2030-03-30' }]); // open → ask about the end from day avg(6)-2 = 4 (04-03)
  assert.equal(cyclePrompt(buildCycleSummary(db, '2030-04-01'), '2030-04-01'), null);
  assert.equal(cyclePrompt(buildCycleSummary(db, '2030-04-03'), '2030-04-03'), 'end');
  db.close();
});

test('estimated entries anchor the prediction but stay out of the averages', () => {
  const db = freshDb();
  seedCycles(db, regular('2030-03-01', 4, 28, 6));
  // a penciled-in month with a wildly wrong gap (40 days) and duration (12 days)
  seedCycles(db, [{ start: '2030-04-10', end: '2030-04-21', estimated: true }]);
  const s = buildCycleSummary(db, '2030-04-25');
  assert.equal(s.avg_cycle_days, 28); // 40-day gap excluded
  assert.equal(s.avg_duration_days, 6); // 12-day duration excluded
  assert.equal(s.predicted_start, addDaysStr('2030-04-10', 28)); // but it anchors the next prediction
  db.close();
});
