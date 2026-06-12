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

test('erase-everything requires the confirmation token', async () => {
  assert.equal((await post('/api/dev/reset', {})).status, 400);
  assert.equal((await post('/api/dev/reset', { confirm: 'ERASE' })).status, 200);
});
