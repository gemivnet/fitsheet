// dayInsights.ts — a short, warm end-of-day reflection on what she ate today. Grounded in the
// real day's log (biggest items, calorie density, eating out, timing). Never shaming.

import { claudeText } from './client';
import type { DB } from '../db/index';
import { getSettings } from '../settings';

export async function generateDayInsights(db: DB, date: string): Promise<string | null> {
  const goal = getSettings(db).daily_calorie_goal;
  const totalRow = db
    .prepare('SELECT SUM(kcal) AS kcal, COUNT(*) AS n, SUM(CASE WHEN eating_out = 1 THEN 1 ELSE 0 END) AS out FROM food_log WHERE day_date = ?')
    .get(date) as { kcal: number | null; n: number; out: number };
  const total = Math.round(totalRow.kcal ?? 0);
  if (!total || !totalRow.n) return null;

  const slots = db.prepare('SELECT meal_slot, ROUND(SUM(kcal)) AS kcal FROM food_log WHERE day_date = ? GROUP BY meal_slot').all(date) as { meal_slot: string; kcal: number }[];
  const top = db.prepare('SELECT name, ROUND(SUM(kcal)) AS kcal, ROUND(SUM(grams)) AS grams FROM food_log WHERE day_date = ? GROUP BY name ORDER BY kcal DESC LIMIT 5').all(date) as {
    name: string;
    kcal: number;
    grams: number;
  }[];

  const topLines = top.map((x) => `${x.name}: ${x.kcal} kcal${x.grams > 0 ? ` (${Math.round((x.kcal / x.grams) * 100)} kcal/100g)` : ''}`).join('; ');
  const slotLines = slots.map((s) => `${s.meal_slot} ${s.kcal}`).join(', ');

  const note = await claudeText({
    system:
      'You are a warm, encouraging nutrition companion. Give a SHORT end-of-day reflection (2-3 sentences) ' +
      'on what she ate today. Call out what genuinely stands out — what drove the most calories, calorie ' +
      'density (calorie-dense vs light foods), eating out, or meal timing — and one nice thing. Be specific ' +
      'and kind, NEVER shaming: over goal is "a bit over, tomorrow is a fresh start", never an alarm. Plain ' +
      'sentences, no lists or headers.',
    content:
      `Goal: ${goal} kcal. Today total: ${total} kcal (${total <= goal ? `${goal - total} under goal` : `${total - goal} over goal`}). ` +
      `By meal: ${slotLines || 'n/a'}. Biggest items: ${topLines || 'n/a'}. Items eaten out today: ${totalRow.out}.`,
    maxTokens: 220,
  });
  return note.trim() || null;
}
