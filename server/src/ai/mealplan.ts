// mealplan.ts — a saved, editable meal plan generated through the structured-output task layer.
// Each meal carries ingredients, a one-line method, and macros so it's tappable and loggable.
// Locked meals survive a regenerate (the model plans around them; we overlay them deterministically).

import { randomUUID } from 'node:crypto';
import type { DB } from '../db/index';
import { runTask } from './task';
import { MealPlanSchema } from './schemas';

export interface StoredMeal {
  id: string;
  slot: string;
  name: string;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  ingredients: string[];
  steps: string;
  locked: boolean;
}
export interface StoredDay {
  label: string;
  meals: StoredMeal[];
}
export interface StoredPlan {
  generated_at: string;
  days_count: number;
  guidance: string;
  days: StoredDay[];
}

export interface KeptMeal {
  dayIndex: number;
  meal: StoredMeal;
}

const SYSTEM =
  'You are a practical meal planner for a busy home cook. Build a day-by-day plan whose daily totals ' +
  'stay at or under her calorie goal and land reasonably close to her macro goals (protein especially). ' +
  'Lean toward her saved recipes, favorite foods, and what she usually eats at each meal — BUT when she ' +
  "gives instructions for this plan, those instructions WIN over her usual habits (if she says " +
  '"scrambled eggs every other day", actually alternate eggs and her usual on the breakfast slot across ' +
  'the days). Do NOT repeat the dinners she had in the last three days. Give EVERY meal a few real ' +
  'ingredients and a one-line method so she knows what it is. Keep it simple and realistic.';

export async function generateMealPlan(db: DB, opts: { days: number; guidance?: string; keep?: KeptMeal[] }): Promise<StoredPlan | null> {
  const days = Math.max(1, Math.min(7, opts.days || 3));
  const keep = opts.keep ?? [];
  const recipes = db.prepare('SELECT name, approx_kcal, cook_band, tags_json FROM recipes ORDER BY is_favorite DESC, updated_at DESC LIMIT 40').all();
  const favorites = db.prepare('SELECT name, kcal_100g, serving_g FROM foods WHERE is_favorite = 1 LIMIT 40').all();

  const keptLines = keep.length
    ? '\nThe user is KEEPING these meals — reproduce them in their day untouched and plan everything else around them, never duplicating them:\n' +
      keep.map((k) => `Day ${k.dayIndex + 1} ${k.meal.slot}: ${k.meal.name} (${k.meal.kcal} kcal)`).join('\n')
    : '';
  const guidanceLine = opts.guidance?.trim()
    ? `\n>>> HER INSTRUCTIONS FOR THIS PLAN — follow these even where they differ from her usual habits: ${opts.guidance.trim()}`
    : '';

  const plan = await runTask(
    db,
    { name: 'meal-plan', schema: MealPlanSchema, system: SYSTEM, globals: ['goals', 'mealHabits', 'topFoods', 'recentDays'], maxTokens: 3500 },
    {
      content:
        `Plan ${days} day${days === 1 ? '' : 's'}. Label the days "Day 1", "Day 2", … in order.${guidanceLine}${keptLines}\n` +
        `Her saved recipes (JSON): ${JSON.stringify(recipes)}\n` +
        `Her favorite foods (JSON): ${JSON.stringify(favorites)}`,
    },
  );
  if (!plan) return null;

  // assemble the stored blob: fresh ids, then overlay kept meals deterministically (source of truth)
  const out: StoredDay[] = plan.days.slice(0, days).map((d) => ({
    label: d.label,
    meals: d.meals.map((m) => ({ ...m, id: randomUUID(), locked: false })),
  }));
  while (out.length < days) out.push({ label: `Day ${out.length + 1}`, meals: [] });

  for (const k of keep) {
    const day = out[k.dayIndex];
    if (!day) continue;
    // drop a generated meal in the same slot so the kept one takes its place, then add the kept meal
    const sameSlot = day.meals.findIndex((m) => m.slot === k.meal.slot && !m.locked);
    if (sameSlot >= 0) day.meals.splice(sameSlot, 1);
    day.meals.push({ ...k.meal, locked: true });
    day.meals.sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot));
  }

  return { generated_at: new Date().toISOString(), days_count: days, guidance: opts.guidance ?? '', days: out };
}

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const slotOrder = (s: string): number => {
  const i = SLOTS.indexOf(s);
  return i < 0 ? SLOTS.length : i;
};
