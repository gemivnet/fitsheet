// suggestMeal.ts — "what should I eat?" decision help. Given her remaining calories + macros for
// today and the foods/recipes she actually eats, suggest 2–3 realistic options for the upcoming
// meal. Grounded in her real history (context) + today's remaining budget; leans on her favorites
// and recipes; avoids repeating what she's already had today. FAST model. Streams (ideas pop in)
// with a structured non-stream fallback.

import type { DB } from '../db/index';
import { assembleContext } from './context';
import { claudeStream, FAST_MODEL } from './client';
import { runTask } from './task';
import { salvageObjects } from './restaurantItem';
import { MealSuggestionsSchema } from './schemas';
import { daySummary } from '../routes/foodLog';
import { todayStr } from '../util';

export interface MealSuggestion {
  name: string;
  slot: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  rationale: string;
  source: 'usual' | 'recipe' | 'new';
  ingredients: string[];
}

export interface SuggestOpts {
  date?: string;
  slot?: string;
}

export const SUGGEST_SYSTEM =
  'You help her decide what to eat next. Suggest 2–3 realistic options for the given meal that FIT her ' +
  'remaining calories for today (do not blow the budget), push protein toward her goal, and lean HARD ' +
  'on the foods and recipes she actually eats — only suggest something new when it genuinely fits and ' +
  'is easy. Do NOT suggest things she already ate today. For each option give a realistic portion in ' +
  'grams with kcal and protein/carb/fat for THAT portion, a short warm one-line rationale, a "source" ' +
  '("usual" = a food/meal she regularly has, "recipe" = one of her saved recipes, "new" = a new idea), ' +
  'and ingredients when it\'s a recipe or new idea. Keep it simple and genuinely helpful.';

export function buildSuggestContent(db: DB, opts: SuggestOpts): string {
  const date = opts.date ?? todayStr();
  const slot = opts.slot ?? 'dinner';
  const day = daySummary(db, date);
  const remaining = day.banking ? day.adjusted_remaining : day.remaining;
  const eaten = (db.prepare('SELECT name FROM food_log WHERE day_date = ? ORDER BY id').all(date) as { name: string }[]).map((r) => r.name);
  const favorites = db.prepare('SELECT name, kcal_100g, protein_100g, serving_g FROM foods WHERE is_favorite = 1 LIMIT 40').all();
  const recipes = db.prepare('SELECT name, approx_kcal, tags_json FROM recipes ORDER BY is_favorite DESC, updated_at DESC LIMIT 30').all();
  const ctx = assembleContext(db, ['goals', 'topFoods', 'mealHabits', 'recentDays'], date);
  return (
    `${ctx}\n\n` +
    `It's ${slot}. She has about ${Math.round(remaining)} kcal left today (daily goal ${day.goal}). ` +
    `Already eaten today: ${eaten.length ? eaten.join(', ') : 'nothing yet'}.\n` +
    `Suggest 2–3 options for ${slot} that fit the remaining calories.\n` +
    `Her favorite foods (JSON): ${JSON.stringify(favorites)}\n` +
    `Her saved recipes (JSON): ${JSON.stringify(recipes)}\n` +
    'Reply ONLY a JSON array, no prose: [{"name": string, "slot": string, "grams": number, "kcal": number, ' +
    '"protein_g": number, "carb_g": number, "fat_g": number, "rationale": string, "source": "usual"|"recipe"|"new", "ingredients": [string]}]'
  );
}

const SLOTS = new Set(['breakfast', 'lunch', 'dinner', 'snacks']);
function cleanSuggestion(raw: any, fallbackSlot: string): MealSuggestion | null {
  if (!raw || !raw.name || !Number.isFinite(Number(raw.kcal))) return null;
  const n = (v: any) => Math.max(0, Math.round(Number(v) || 0));
  return {
    name: String(raw.name),
    slot: SLOTS.has(raw.slot) ? raw.slot : fallbackSlot,
    grams: n(raw.grams),
    kcal: n(raw.kcal),
    protein_g: n(raw.protein_g),
    carb_g: n(raw.carb_g),
    fat_g: n(raw.fat_g),
    rationale: String(raw.rationale || ''),
    source: raw.source === 'usual' || raw.source === 'recipe' ? raw.source : 'new',
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.map((x: any) => String(x)).slice(0, 12) : [],
  };
}

/** Non-streaming, structured — the fallback. */
export async function suggestMeals(db: DB, opts: SuggestOpts): Promise<MealSuggestion[]> {
  const out = await runTask(db, { name: 'suggest-meal', schema: MealSuggestionsSchema, model: 'fast', system: SUGGEST_SYSTEM, maxTokens: 1200 }, { content: buildSuggestContent(db, opts) });
  return (out?.suggestions ?? []).map((s) => cleanSuggestion(s, opts.slot ?? 'dinner')).filter((s): s is MealSuggestion => s != null);
}

/** Streaming — suggestions pop in as they're generated. Returns the final cleaned list. */
export async function streamSuggestMeals(db: DB, opts: SuggestOpts, onItem: (s: MealSuggestion) => void): Promise<MealSuggestion[]> {
  const slot = opts.slot ?? 'dinner';
  const collected: MealSuggestion[] = [];
  let acc = '';
  let emitted = 0;
  const drain = () => {
    const objs = salvageObjects(acc);
    for (; emitted < objs.length; emitted++) {
      const s = cleanSuggestion(objs[emitted], slot);
      if (s) {
        collected.push(s);
        onItem(s);
      }
    }
  };
  await claudeStream({ model: FAST_MODEL, system: SUGGEST_SYSTEM, content: buildSuggestContent(db, opts), maxTokens: 1200, timeoutMs: 60_000, onText: (d) => { acc += d; drain(); } });
  drain();
  return collected;
}
