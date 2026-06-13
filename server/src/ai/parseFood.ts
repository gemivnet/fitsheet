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
}

const TASK = {
  name: 'parse-food',
  globals: ['topFoods', 'mealHabits'] as const,
  schema: ParsedFoodResultSchema,
  system:
    'You convert a casual meal description into individual foods with realistic gram amounts and ' +
    'nutrition. Estimate typical portion sizes when amounts are not given. When a food matches one ' +
    'she logs often, use that name and her usual portion. Be reasonable, not exact.',
};

export async function parseFood(db: DB, text: string, slot?: string): Promise<ParsedFood[]> {
  const recent = slot ? recentSlotFoods(db, slot) : '';
  const hint = recent ? `\n\nLately at ${slot} she's logged: ${recent}. If part of the description plausibly matches one of these, use that exact item and its brand.` : '';
  const out = await runTask(db, { ...TASK, globals: [...TASK.globals] }, { content: `Parse this into foods: "${text}".${hint}` });
  return (out?.items ?? []).filter((x) => x.grams > 0);
}
