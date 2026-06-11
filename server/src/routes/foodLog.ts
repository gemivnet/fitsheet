import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { addDaysStr, clamp, nowIso, round, todayStr } from '../util';

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

export function foodLogRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const date = (req.query.date as string) || todayStr();
    res.json(daySummary(db, date));
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
    const date = b.date || todayStr();
    const slot = SLOTS.includes(b.meal_slot) ? b.meal_slot : 'snacks';
    const grams = Number(b.grams) || 0;
    const factor = grams / 100;
    const kcal = round(Number(b.kcal_100g ?? 0) * factor, 0);
    const protein = round(Number(b.protein_100g ?? 0) * factor, 1);
    const carb = round(Number(b.carb_100g ?? 0) * factor, 1);
    const fat = round(Number(b.fat_100g ?? 0) * factor, 1);
    const ts = nowIso();
    const info = db
      .prepare(
        'INSERT INTO food_log (day_date,meal_slot,food_id,name,grams,kcal,protein,carb,fat,sort_order,created_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(date, slot, b.food_id ?? null, b.name ?? 'Food', grams, kcal, protein, carb, fat, Date.now() % 100000, ts);
    // Remember how this food was entered (grams vs servings) and the amount, so re-adding
    // it pre-fills the same way. Bumping updated_at also floats it up the "My foods" list.
    if (b.food_id != null) {
      const um = b.unit_mode === 'servings' ? 'servings' : b.unit_mode === 'grams' ? 'grams' : null;
      db.prepare('UPDATE foods SET pref_unit_mode = COALESCE(?, pref_unit_mode), last_grams = ?, updated_at = ? WHERE id = ?').run(um, grams, ts, b.food_id);
    }
    const addedId = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'food_log', entityId: addedId, action: 'create' });
    res.json({ ...daySummary(db, date), added_id: addedId });
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM food_log WHERE id = ?').get(id) as LogRow | undefined;
    if (!row) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, any>;
    let { grams, kcal, protein, carb, fat } = row;
    if (b.grams != null && row.grams > 0) {
      const ratio = Number(b.grams) / row.grams;
      grams = Number(b.grams);
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
    db.prepare('DELETE FROM food_log WHERE id = ?').run(id);
    writeAudit(db, { entity: 'food_log', entityId: id, action: 'delete' });
    res.json(daySummary(db, row?.day_date || todayStr()));
  });

  return r;
}
