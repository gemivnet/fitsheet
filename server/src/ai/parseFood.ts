// parseFood.ts — natural-language meal description → individual foods with estimated grams + nutrition.
// Goes through the task layer: the schema is enforced by the API, her usual foods + per-meal habits
// are injected automatically as context.

import type { DB } from '../db/index';
import { runTask } from './task';
import { recentSlotFoods } from './context';
import { ParsedFoodResultSchema } from './schemas';

export interface ParsedFood {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  confidence?: 'high' | 'medium' | 'low';
  clarify?: { question: string; options: string[] } | null;
}

// Shared instruction: ask only when a food's IDENTITY is genuinely ambiguous (not about amounts).
export const CLARIFY_RULE =
  'For each food, set "confidence" (high|medium|low). When a food is AMBIGUOUS — a generic name that ' +
  'could be distinct products with very different nutrition (e.g. "eggs" could be real eggs or Egg ' +
  'Beaters; "milk" whole vs skim; an unspecified brand or preparation) — set confidence "low" or ' +
  '"medium" and include a short "clarify" with a "question" and 2–4 concrete "options" she can pick ' +
  '(likely brand/variant names plus a plain or homemade version). Still fill in your best-guess ' +
  'numbers. For clear, unambiguous foods set confidence "high" and clarify null. Only clarify ' +
  'IDENTITY, never amounts.';

const TASK = {
  name: 'parse-food',
  globals: ['topFoods', 'mealHabits'] as const,
  schema: ParsedFoodResultSchema,
  system:
    'You convert a casual meal description into individual foods with realistic gram amounts and ' +
    'nutrition. Estimate typical portion sizes when amounts are not given. When a food matches one ' +
    'she logs often, use that name and her usual portion. Be reasonable, not exact. ' +
    CLARIFY_RULE,
};

export async function parseFood(db: DB, text: string, slot?: string): Promise<ParsedFood[]> {
  const recent = slot ? recentSlotFoods(db, slot) : '';
  const hint = recent ? `\n\nLately at ${slot} she's logged: ${recent}. If part of the description plausibly matches one of these, use that exact item and its brand.` : '';
  const out = await runTask(db, { ...TASK, globals: [...TASK.globals] }, { content: `Parse this into foods: "${text}".${hint}` });
  return (out?.items ?? []).filter((x) => x.grams > 0);
}
