import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { nowIso, round, todayStr } from '../util';

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
  const goal = getSettings(db).daily_calorie_goal;
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
  return { date, goal, totals, remaining: Math.round(goal - totals.kcal), slots, slot_kcal: slotKcal };
}

export function foodLogRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const date = (req.query.date as string) || todayStr();
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
    writeAudit(db, { entity: 'food_log', entityId: Number(info.lastInsertRowid), action: 'create' });
    res.json(daySummary(db, date));
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
