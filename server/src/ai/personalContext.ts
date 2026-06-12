// personalContext.ts — a compact, prompt-injectable profile of how she ACTUALLY eats. The whole
// app is single-user, so AI calls are allowed to lean hard on her real history rather than a
// generic average. Sibling to the analytics layer; folded into the AI prompts.

import type { DB } from '../db/index';

export interface PersonalContext {
  topFoods: { name: string; n: number; usual_grams: number }[];
  mealTiming: { meal_slot: string; n: number }[];
  slotUsuals: Record<string, string[]>;
}

function compute(db: DB): PersonalContext {
  const topFoods = db
    .prepare(
      "SELECT name, COUNT(*) AS n, ROUND(AVG(grams)) AS usual_grams FROM food_log " +
        "WHERE day_date >= date('now','-60 days') GROUP BY LOWER(name) ORDER BY n DESC LIMIT 25",
    )
    .all() as { name: string; n: number; usual_grams: number }[];
  const mealTiming = db
    .prepare("SELECT meal_slot, COUNT(*) AS n FROM food_log WHERE day_date >= date('now','-30 days') GROUP BY meal_slot")
    .all() as { meal_slot: string; n: number }[];
  // what she actually has per meal — sharpens parsing ("eggs" at 7am means HER eggs)
  const rows = db
    .prepare("SELECT meal_slot, name, COUNT(*) AS n FROM food_log WHERE day_date >= date('now','-60 days') GROUP BY meal_slot, LOWER(name) ORDER BY n DESC")
    .all() as { meal_slot: string; name: string; n: number }[];
  const slotUsuals: Record<string, string[]> = {};
  for (const r of rows) {
    (slotUsuals[r.meal_slot] ??= []);
    if (slotUsuals[r.meal_slot].length < 5 && r.n >= 2) slotUsuals[r.meal_slot].push(r.name);
  }
  return { topFoods, mealTiming, slotUsuals };
}

// Cached: her habits don't change minute-to-minute, and AI calls shouldn't re-run these every time.
// TTL backstop + explicit invalidation when she logs food. (Single user, so one global cache.)
let cache: { at: number; ctx: PersonalContext } | null = null;
const TTL_MS = 10 * 60 * 1000;
export function buildPersonalContext(db: DB): PersonalContext {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.ctx;
  const ctx = compute(db);
  cache = { at: now, ctx };
  return ctx;
}
export function invalidatePersonalContext(): void {
  cache = null;
}

// A short line of "foods she logs a lot (with her usual portion)" for prompt grounding.
export function personalFoodsHint(db: DB): string {
  const { topFoods } = buildPersonalContext(db);
  if (!topFoods.length) return '';
  return topFoods
    .slice(0, 20)
    .map((f) => `${f.name} (~${Math.round(f.usual_grams)}g)`)
    .join(', ');
}

// "breakfast usuals: grits, coffee; lunch usuals: …" — one line of per-meal habits.
export function personalSlotHint(db: DB): string {
  const { slotUsuals } = buildPersonalContext(db);
  const parts = Object.entries(slotUsuals)
    .filter(([, names]) => names.length)
    .map(([slot, names]) => `${slot} usuals: ${names.join(', ')}`);
  return parts.join('; ');
}

// What she usually gets at a specific restaurant — derived from her cached orders there (the
// components she keeps including) plus any saved orders. Used to pre-tick HER actual order.
export function restaurantHistory(db: DB, restaurant: string): string[] {
  const counts = new Map<string, number>();
  const cached = db.prepare('SELECT components_json FROM restaurant_menu WHERE restaurant = ? ORDER BY updated_at DESC LIMIT 12').all(restaurant) as { components_json: string }[];
  for (const c of cached) {
    try {
      for (const comp of JSON.parse(c.components_json) as { name?: string; default_on?: boolean }[]) {
        if (comp?.name && comp.default_on !== false) counts.set(comp.name, (counts.get(comp.name) ?? 0) + 1);
      }
    } catch {
      /* skip */
    }
  }
  const saved = db.prepare("SELECT name FROM foods WHERE restaurant = ? AND eating_out = 1 ORDER BY updated_at DESC LIMIT 10").all(restaurant) as { name: string }[];
  for (const s of saved) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map((e) => e[0]);
}
