// dayInsights.ts — a short, warm end-of-day reflection on what she ate today. Grounded in the
// real day's log (biggest items, calorie density, eating out, timing) plus the bigger picture:
// yesterday, protein vs goal, the weekly bank, and any streak. Never shaming.

import { claudeText, FAST_MODEL } from './client';
import { MARMALADE } from './persona';
import { assembleContext } from './context';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { daySummary } from '../routes/foodLog';
import { addDaysStr } from '../util';

export async function generateDayInsights(db: DB, date: string): Promise<string | null> {
  const settings = getSettings(db);
  const goal = settings.daily_calorie_goal;
  const totalRow = db
    .prepare('SELECT SUM(kcal) AS kcal, SUM(protein) AS protein, COUNT(*) AS n, SUM(CASE WHEN eating_out = 1 THEN 1 ELSE 0 END) AS out FROM food_log WHERE day_date = ?')
    .get(date) as { kcal: number | null; protein: number | null; n: number; out: number };
  const total = Math.round(totalRow.kcal ?? 0);
  if (!total || !totalRow.n) return null;

  const slots = db.prepare('SELECT meal_slot, ROUND(SUM(kcal)) AS kcal FROM food_log WHERE day_date = ? GROUP BY meal_slot').all(date) as { meal_slot: string; kcal: number }[];
  const top = db.prepare('SELECT name, ROUND(SUM(kcal)) AS kcal, ROUND(SUM(grams)) AS grams FROM food_log WHERE day_date = ? GROUP BY name ORDER BY kcal DESC LIMIT 5').all(date) as {
    name: string;
    kcal: number;
    grams: number;
  }[];

  // the bigger picture, all cheap queries
  const weekday = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  const yRow = db.prepare('SELECT SUM(kcal) AS k FROM food_log WHERE day_date = ?').get(addDaysStr(date, -1)) as { k: number | null };
  const yesterday = yRow.k == null ? null : Math.round(yRow.k);
  const protein = Math.round(totalRow.protein ?? 0);
  let underStreak = 0;
  for (let i = 0; i < 60; i++) {
    const k = (db.prepare('SELECT SUM(kcal) AS k FROM food_log WHERE day_date = ?').get(addDaysStr(date, -i)) as { k: number | null }).k;
    if (k != null && k <= goal) underStreak++;
    else break;
  }
  const bank = daySummary(db, date);

  const topLines = top.map((x) => `${x.name}: ${x.kcal} kcal${x.grams > 0 ? ` (${Math.round((x.kcal / x.grams) * 100)} kcal/100g)` : ''}`).join('; ');
  const slotLines = slots.map((s) => `${s.meal_slot} ${s.kcal}`).join(', ');

  const note = await claudeText({
    model: FAST_MODEL,
    system:
      `${MARMALADE}\n\n` +
      'Give a SHORT end-of-day reflection (2-3 sentences) on what she ate today. Call out what genuinely ' +
      'stands out — what drove the most calories, calorie density (calorie-dense vs light foods), eating ' +
      'out, or meal timing — and one nice thing. You may reference yesterday, the weekly calorie bank, ' +
      'protein, or a streak when genuinely notable, but never cram everything in. Be specific and kind, ' +
      'NEVER shaming: over goal is "a bit over, tomorrow is a fresh start", never an alarm. Plain ' +
      'sentences, no lists or headers.',
    content:
      `${assembleContext(db, ['topFoods', 'mealHabits'], date)}\n\n` +
      `${weekday}. Goal: ${goal} kcal. Today total: ${total} kcal (${total <= goal ? `${goal - total} under goal` : `${total - goal} over goal`}). ` +
      `Yesterday: ${yesterday == null ? 'not logged' : `${yesterday} kcal`}. Protein today: ${protein} g (goal ${settings.protein_goal_g} g). ` +
      `Days at-or-under goal in a row (incl. today if under): ${underStreak}. Weekly bank: ${bank.bank_week >= 0 ? '+' : ''}${bank.bank_week} kcal. ` +
      `By meal: ${slotLines || 'n/a'}. Biggest items: ${topLines || 'n/a'}. Items eaten out today: ${totalRow.out}.`,
    maxTokens: 220,
  });
  return note.trim() || null;
}
