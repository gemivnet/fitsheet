// Integration tests on a real in-memory DB + ephemeral HTTP server — the seams that
// regress silently: validation, day handling, deletes, streak milestones, the reset guard.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { openDb, type DB } from '../db/index';
import { migrate } from '../db/migrate';
import { seedDefaults } from '../seed';
import { buildServer } from '../server';
import { addDaysStr, todayStr } from '../util';

let db: DB;
let srv: Server;
let base = '';

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  db = openDb(':memory:');
  migrate(db);
  seedDefaults(db);
  const app = buildServer(db);
  await new Promise<void>((resolve) => {
    srv = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
});

after(() => {
  srv.close();
  db.close();
});

test('rejects non-numeric grams with 400 (never logs 0 g silently)', async () => {
  const r = await post('/api/food-log', { date: '2026-06-10', meal_slot: 'lunch', name: 'x', grams: 'abc', kcal_100g: 100 });
  assert.equal(r.status, 400);
});

test('logs a food on the client-sent day and stores the local hour', async () => {
  const r = await post('/api/food-log', { date: '2026-06-10', meal_slot: 'lunch', name: 'toast', grams: 50, kcal_100g: 250, hour: 8 });
  assert.equal(r.status, 200);
  const sum = await r.json();
  assert.equal(sum.date, '2026-06-10');
  assert.equal(sum.totals.kcal, 125);
  const row = db.prepare('SELECT hour_local FROM food_log WHERE id = ?').get(sum.added_id) as { hour_local: number };
  assert.equal(row.hour_local, 8);
});

test('deleting a missing entry is a 404, not another day summary', async () => {
  const r = await fetch(`${base}/api/food-log/99999`, { method: 'DELETE' });
  assert.equal(r.status, 404);
});

test('suggestions accept a client hour and exclude foods already in the meal', async () => {
  const food = await (await post('/api/foods', { name: 'Oatmeal', kcal_100g: 380 })).json();
  await post('/api/food-log', { date: '2026-06-11', meal_slot: 'breakfast', food_id: food.id, name: 'Oatmeal', grams: 40, kcal_100g: 380, hour: 7 });
  const list = await (await fetch(`${base}/api/foods/suggestions?slot=breakfast&date=2026-06-11&hour=7`)).json();
  assert.ok(Array.isArray(list));
  assert.ok(!list.some((f: { id: number }) => f.id === food.id), 'already-logged food should not be suggested for the same meal');
});

test('a 7-day logging streak records a milestone exactly once', async () => {
  const today = todayStr();
  for (let i = 1; i <= 6; i++) {
    await post('/api/food-log', { date: addDaysStr(today, -i), meal_slot: 'dinner', name: 'meal', grams: 100, kcal_100g: 200 });
  }
  await post('/api/food-log', { date: today, meal_slot: 'dinner', name: 'meal', grams: 100, kcal_100g: 200 });
  await post('/api/food-log', { date: today, meal_slot: 'snacks', name: 'snack', grams: 50, kcal_100g: 100 });
  const ms = db.prepare("SELECT * FROM milestones WHERE kind = 'logging_streak' AND threshold_lb = 7").all();
  assert.equal(ms.length, 1);
});

test('weight rejects garbage, accepts sane values, and PATCH fixes typos', async () => {
  assert.equal((await post('/api/weight', { weight_lb: 'oops' })).status, 400);
  const r = await post('/api/weight', { entry_date: '2026-06-11', weight_lb: 200 });
  assert.equal(r.status, 200);
  const { entry } = await r.json();
  const patched = await fetch(`${base}/api/weight/${entry.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weight_lb: 199 }) });
  assert.equal(patched.status, 200);
  assert.equal((await patched.json()).weight_lb, 199);
});

test('bank reports its cap and the odd days it left out', async () => {
  // five sane under-goal days (950 kcal vs 1850 goal) + one 300-kcal partial day
  for (let i = 1; i <= 5; i++) {
    await post('/api/food-log', { date: addDaysStr('2026-04-15', -i), meal_slot: 'dinner', name: 'meal', grams: 100, kcal_100g: 950 });
  }
  await post('/api/food-log', { date: '2026-04-09', meal_slot: 'dinner', name: 'tiny', grams: 100, kcal_100g: 300 });
  const sum = await (await fetch(`${base}/api/food-log?date=2026-04-15`)).json();
  assert.equal(sum.bank_week, 4500); // 5 × 900 under
  assert.equal(sum.bank_skipped_days, 1);
  assert.equal(sum.adjusted_goal, 1850 + 800); // clamped
  assert.equal(sum.bank_capped, true);
});

test('usual meal splits weekday vs weekend and uses the latest variant', async () => {
  // weekend pattern: pancakes on three Saturdays (2026-02-21/28, 03-07)
  for (const d of ['2026-02-21', '2026-02-28', '2026-03-07']) {
    await post('/api/food-log', { date: d, meal_slot: 'breakfast', name: 'Pancakes', grams: 120, kcal_100g: 220 });
  }
  // weekday pattern: toast Mon-Fri (2026-03-02..06) + oats three times with changing nutrition
  for (let i = 2; i <= 6; i++) {
    await post('/api/food-log', { date: `2026-03-0${i}`, meal_slot: 'breakfast', name: 'Toast', grams: 40, kcal_100g: 250 });
  }
  await post('/api/food-log', { date: '2026-03-03', meal_slot: 'breakfast', name: 'Oats', grams: 50, kcal_100g: 350 });
  await post('/api/food-log', { date: '2026-03-04', meal_slot: 'breakfast', name: 'Oats', grams: 50, kcal_100g: 400 });
  await post('/api/food-log', { date: '2026-03-05', meal_slot: 'breakfast', name: 'Oats', grams: 50, kcal_100g: 300 });

  const sat = await (await fetch(`${base}/api/food-log/usual?slot=breakfast&date=2026-03-14`)).json();
  assert.equal(sat.found, true);
  assert.ok(sat.items.some((i: { name: string }) => i.name === 'Pancakes'), 'weekend usual has pancakes');
  assert.ok(!sat.items.some((i: { name: string }) => i.name === 'Toast'), 'weekend usual excludes weekday toast');

  const wed = await (await fetch(`${base}/api/food-log/usual?slot=breakfast&date=2026-03-11`)).json();
  assert.ok(wed.items.some((i: { name: string }) => i.name === 'Toast'), 'weekday usual has toast');
  assert.ok(!wed.items.some((i: { name: string }) => i.name === 'Pancakes'), 'weekday usual excludes pancakes');
  const oats = wed.items.find((i: { name: string }) => i.name === 'Oats');
  assert.ok(oats, 'oats logged on 3 of 5 weekdays makes the cut');
  assert.equal(oats.kcal_100g, 300); // the LATEST variant, not the average
});

test('a described food joins the library and later logs link to it', async () => {
  const before = (db.prepare('SELECT COUNT(*) AS n FROM foods').get() as { n: number }).n;
  const r1 = await post('/api/food-log', { date: '2026-05-01', meal_slot: 'lunch', name: 'Lentil Soup', grams: 300, kcal_100g: 60, protein_100g: 4, carb_100g: 8, fat_100g: 1 });
  const sum1 = await r1.json();
  const created = db.prepare("SELECT * FROM foods WHERE source = 'described' AND name = 'Lentil Soup'").get() as { id: number; kcal_100g: number } | undefined;
  assert.ok(created, 'described food created');
  assert.equal(created.kcal_100g, 60);
  const logged = db.prepare('SELECT food_id FROM food_log WHERE id = ?').get(sum1.added_id) as { food_id: number };
  assert.equal(logged.food_id, created.id, 'log row links to the new food');

  // a different casing matches the same food — no duplicate, last_grams bumped
  const r2 = await post('/api/food-log', { date: '2026-05-02', meal_slot: 'lunch', name: 'LENTIL SOUP', grams: 250, kcal_100g: 60 });
  const sum2 = await r2.json();
  const after = (db.prepare('SELECT COUNT(*) AS n FROM foods').get() as { n: number }).n;
  assert.equal(after, before + 1, 'no duplicate food');
  assert.equal((db.prepare('SELECT food_id FROM food_log WHERE id = ?').get(sum2.added_id) as { food_id: number }).food_id, created.id);
  assert.equal((db.prepare('SELECT last_grams FROM foods WHERE id = ?').get(created.id) as { last_grams: number }).last_grams, 250);
});

test('no auto-food for dining orders, zero-calorie payloads, or opted-out entries', async () => {
  const count = () => (db.prepare('SELECT COUNT(*) AS n FROM foods').get() as { n: number }).n;
  const before = count();
  await post('/api/food-log', { date: '2026-05-03', meal_slot: 'dinner', name: 'Some Cafe · bowl', grams: 400, kcal_100g: 150, eating_out: 1 });
  await post('/api/food-log', { date: '2026-05-03', meal_slot: 'dinner', name: 'Mystery', grams: 100, kcal_100g: 0 });
  await post('/api/food-log', { date: '2026-05-03', meal_slot: 'dinner', name: 'One-off Dish', grams: 200, kcal_100g: 120, auto_food: false });
  assert.equal(count(), before, 'none of these grow the library');
});

test('erase-everything requires the confirmation token', async () => {
  assert.equal((await post('/api/dev/reset', {})).status, 400);
  assert.equal((await post('/api/dev/reset', { confirm: 'ERASE' })).status, 200);
});
