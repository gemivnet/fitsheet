import { Router } from 'express';
import { invalidatePersonalContext } from '../ai/personalContext';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { addDaysStr, clamp, finiteNum, hourOfDay, isDayStr, nowIso, round, todayStr } from '../util';

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

interface LogRow {
  id: number;
  day_date: string;
  meal_slot: string;
  food_id: number | null;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sort_order: number;
  eating_out: number;
}

export function daySummary(db: DB, date: string) {
  const s = getSettings(db);
  const goal = s.daily_calorie_goal;
  const rows = db.prepare('SELECT * FROM food_log WHERE day_date = ? ORDER BY meal_slot, sort_order, id').all(date) as LogRow[];
  const slots: Record<string, LogRow[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  const slotKcal: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
  const totals = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  for (const r of rows) {
    (slots[r.meal_slot] ??= []).push(r);
    slotKcal[r.meal_slot] = (slotKcal[r.meal_slot] ?? 0) + r.kcal;
    totals.kcal += r.kcal;
    totals.protein += r.protein;
    totals.carb += r.carb;
    totals.fat += r.fat;
  }
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = round(totals[k], 0);

  // ── weekly calorie banking: roll prior over/under into today's target ──
  // Only count a prior day if its intake looks like a real, complete log. A barely-logged
  // day would otherwise bank a huge phantom surplus into today; an absurd over-log would
  // trim today unfairly. Days outside a sane window are skipped (treated as a logging gap).
  const bankLo = Math.max(500, goal * 0.4);
  const bankHi = goal * 2.5;
  const intakeOn = (d: string): number | null => {
    const r = db.prepare('SELECT SUM(kcal) AS k FROM food_log WHERE day_date = ?').get(d) as { k: number | null };
    return r.k == null ? null : r.k;
  };
  let bankWeek = 0;
  for (let i = 1; i <= 6; i++) {
    const v = intakeOn(addDaysStr(date, -i));
    if (v == null) continue; // unlogged day — nothing to bank
    if (v < bankLo || v > bankHi) continue; // insanely off — ignore (logging gap or error)
    bankWeek += goal - v; // under = positive (headroom), over = negative
  }
  bankWeek = Math.round(bankWeek);
  const yIntake = intakeOn(addDaysStr(date, -1));
  const bankYesterday = yIntake == null ? null : Math.round(goal - yIntake);

  // Per-meal "complete" ticks (organizational only).
  const slotsComplete: Record<string, boolean> = { breakfast: false, lunch: false, dinner: false, snacks: false };
  for (const r of db.prepare('SELECT meal_slot FROM meal_complete WHERE day_date = ?').all(date) as { meal_slot: string }[]) {
    slotsComplete[r.meal_slot] = true;
  }

  // She can "snooze" the bank for a single day → that day uses the plain goal.
  const snoozed = !!db.prepare('SELECT 1 FROM bank_snooze WHERE day_date = ?').get(date);
  const adjustment = s.weekly_banking && !snoozed ? clamp(bankWeek, -800, 800) : 0;
  const adjustedGoal = Math.max(1200, goal + adjustment);

  return {
    date,
    goal,
    totals,
    remaining: Math.round(goal - totals.kcal),
    slots,
    slot_kcal: slotKcal,
    slots_complete: slotsComplete,
    banking: s.weekly_banking,
    bank_week: bankWeek,
    bank_yesterday: bankYesterday,
    bank_snoozed: snoozed,
    adjusted_goal: adjustedGoal,
    adjusted_remaining: Math.round(adjustedGoal - totals.kcal),
  };
}

// Celebrate showing up: when the logging streak ending on `date` crosses 7 or 30 days,
// record a milestone (same table + dashboard → celebration pipeline as weight milestones).
// INSERT OR IGNORE + the (kind, threshold) unique index = each fires once, never nags.
function detectStreakMilestones(db: DB, date: string): void {
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    if (!db.prepare('SELECT 1 FROM food_log WHERE day_date = ? LIMIT 1').get(addDaysStr(date, -i))) break;
    streak++;
  }
  const ins = db.prepare("INSERT OR IGNORE INTO milestones (kind, threshold_lb, achieved_date, acknowledged, created_at) VALUES ('logging_streak', ?, ?, 0, ?)");
  for (const threshold of [7, 30]) if (streak >= threshold) ins.run(threshold, date, nowIso());
}

export function foodLogRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const date = (req.query.date as string) || todayStr();
    res.json(daySummary(db, date));
  });

  // "Your usual meal": foods she logs in this slot on most days → a template she can tweak + log.
  r.get('/usual', (req, res) => {
    const slot = SLOTS.includes(req.query.slot as (typeof SLOTS)[number]) ? (req.query.slot as string) : 'breakfast';
    const date = (req.query.date as string) || todayStr();
    const from = addDaysStr(date, -14);
    const to = addDaysStr(date, -1);
    const totalDays = (db.prepare('SELECT COUNT(DISTINCT day_date) AS d FROM food_log WHERE meal_slot = ? AND day_date BETWEEN ? AND ?').get(slot, from, to) as { d: number }).d;
    if (totalDays < 2) return res.json({ found: false, slot, days_seen: totalDays, items: [] });
    const rows = db
      .prepare(
        'SELECT name, MAX(food_id) AS food_id, COUNT(DISTINCT day_date) AS days, AVG(grams) AS grams, ' +
          'AVG(CASE WHEN grams > 0 THEN kcal * 100.0 / grams ELSE 0 END) AS kcal_100g, ' +
          'AVG(CASE WHEN grams > 0 THEN protein * 100.0 / grams ELSE 0 END) AS protein_100g, ' +
          'AVG(CASE WHEN grams > 0 THEN carb * 100.0 / grams ELSE 0 END) AS carb_100g, ' +
          'AVG(CASE WHEN grams > 0 THEN fat * 100.0 / grams ELSE 0 END) AS fat_100g ' +
          'FROM food_log WHERE meal_slot = ? AND day_date BETWEEN ? AND ? GROUP BY name',
      )
      .all(slot, from, to) as { name: string; food_id: number | null; days: number; grams: number; kcal_100g: number; protein_100g: number; carb_100g: number; fat_100g: number }[];
    const threshold = Math.max(2, Math.ceil(totalDays * 0.5)); // appears on at least half the logged days
    const items = rows
      .filter((r2) => r2.days >= threshold)
      .sort((a, b) => b.days - a.days)
      .map((r2) => ({
        food_id: r2.food_id ?? null,
        name: r2.name,
        grams: Math.round(r2.grams),
        kcal_100g: Math.round(r2.kcal_100g),
        protein_100g: round(r2.protein_100g, 1),
        carb_100g: round(r2.carb_100g, 1),
        fat_100g: round(r2.fat_100g, 1),
      }));
    res.json({ found: items.length >= 1, slot, days_seen: totalDays, items });
  });

  // Gentle "eating out" counter: distinct meals (day+slot) eaten out this week vs last week.
  r.get('/dining-stats', (req, res) => {
    const date = (req.query.date as string) || todayStr();
    const count = (from: string, to: string): number =>
      (db.prepare('SELECT COUNT(*) AS n FROM (SELECT DISTINCT day_date, meal_slot FROM food_log WHERE eating_out = 1 AND day_date BETWEEN ? AND ?)').get(from, to) as { n: number }).n;
    res.json({ this_week: count(addDaysStr(date, -6), date), last_week: count(addDaysStr(date, -13), addDaysStr(date, -7)) });
  });

  // Toggle the calorie bank off (or back on) for a single day.
  r.post('/snooze', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const date = b.date || todayStr();
    const on = b.snoozed !== false; // default: snooze on
    if (on) db.prepare('INSERT OR IGNORE INTO bank_snooze (day_date, created_at) VALUES (?, ?)').run(date, nowIso());
    else db.prepare('DELETE FROM bank_snooze WHERE day_date = ?').run(date);
    writeAudit(db, { entity: 'bank_snooze', entityId: 0, action: on ? 'create' : 'delete', diff: { date } });
    res.json(daySummary(db, date));
  });

  // Tick a meal complete (or un-tick) for a day.
  r.post('/meal-complete', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const date = b.date || todayStr();
    const slot = SLOTS.includes(b.meal_slot) ? b.meal_slot : null;
    if (!slot) return res.status(400).json({ error: 'bad meal_slot' });
    const on = b.complete !== false; // default: mark complete
    if (on) db.prepare('INSERT OR IGNORE INTO meal_complete (day_date, meal_slot, created_at) VALUES (?, ?, ?)').run(date, slot, nowIso());
    else db.prepare('DELETE FROM meal_complete WHERE day_date = ? AND meal_slot = ?').run(date, slot);
    writeAudit(db, { entity: 'meal_complete', entityId: 0, action: on ? 'create' : 'delete', diff: { date, slot } });
    res.json(daySummary(db, date));
  });

  r.post('/', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const date = isDayStr(b.date) ? b.date : todayStr();
    const slot = SLOTS.includes(b.meal_slot) ? b.meal_slot : 'snacks';
    const grams = finiteNum(b.grams);
    if (grams == null || grams <= 0) return res.status(400).json({ error: 'grams must be a positive number' });
    const factor = grams / 100;
    const kcal = round((finiteNum(b.kcal_100g) ?? 0) * factor, 0);
    const protein = round((finiteNum(b.protein_100g) ?? 0) * factor, 1);
    const carb = round((finiteNum(b.carb_100g) ?? 0) * factor, 1);
    const fat = round((finiteNum(b.fat_100g) ?? 0) * factor, 1);
    // eating-out flag: explicit from the client, else inherited from the saved food.
    let eatingOut = b.eating_out != null ? (b.eating_out ? 1 : 0) : 0;
    if (b.eating_out == null && b.food_id != null) {
      const f = db.prepare('SELECT eating_out FROM foods WHERE id = ?').get(b.food_id) as { eating_out: number } | undefined;
      eatingOut = f?.eating_out ? 1 : 0;
    }
    const ts = nowIso();
    const info = db
      .prepare(
        'INSERT INTO food_log (day_date,meal_slot,food_id,name,grams,kcal,protein,carb,fat,sort_order,eating_out,created_at,hour_local) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(date, slot, b.food_id ?? null, b.name ?? 'Food', grams, kcal, protein, carb, fat, Date.now() % 100000, eatingOut, ts, hourOfDay(b.hour));
    // Remember how this food was entered (grams vs servings) and the amount, so re-adding
    // it pre-fills the same way. Bumping updated_at also floats it up the "My foods" list.
    if (b.food_id != null) {
      const um = b.unit_mode === 'servings' ? 'servings' : b.unit_mode === 'grams' ? 'grams' : null;
      db.prepare('UPDATE foods SET pref_unit_mode = COALESCE(?, pref_unit_mode), last_grams = ?, updated_at = ? WHERE id = ?').run(um, grams, ts, b.food_id);
    }
    const addedId = Number(info.lastInsertRowid);
    invalidatePersonalContext(); // her habits just changed
    detectStreakMilestones(db, date);
    writeAudit(db, { entity: 'food_log', entityId: addedId, action: 'create' });
    res.json({ ...daySummary(db, date), added_id: addedId });
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM food_log WHERE id = ?').get(id) as LogRow | undefined;
    if (!row) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, any>;
    let { grams, kcal, protein, carb, fat } = row;
    const newGrams = finiteNum(b.grams);
    if (b.grams != null && (newGrams == null || newGrams <= 0)) return res.status(400).json({ error: 'grams must be a positive number' });
    if (newGrams != null && row.grams > 0) {
      const ratio = newGrams / row.grams;
      grams = newGrams;
      kcal = round(row.kcal * ratio, 0);
      protein = round(row.protein * ratio, 1);
      carb = round(row.carb * ratio, 1);
      fat = round(row.fat * ratio, 1);
    }
    const slot = b.meal_slot && SLOTS.includes(b.meal_slot) ? b.meal_slot : row.meal_slot;
    db.prepare('UPDATE food_log SET grams=?,kcal=?,protein=?,carb=?,fat=?,meal_slot=? WHERE id=?').run(grams, kcal, protein, carb, fat, slot, id);
    writeAudit(db, { entity: 'food_log', entityId: id, action: 'update' });
    res.json(daySummary(db, row.day_date));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT day_date FROM food_log WHERE id = ?').get(id) as { day_date: string } | undefined;
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare('DELETE FROM food_log WHERE id = ?').run(id);
    invalidatePersonalContext();
    writeAudit(db, { entity: 'food_log', entityId: id, action: 'delete' });
    res.json(daySummary(db, row.day_date));
  });

  return r;
}
