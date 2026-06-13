// parseFood.ts — natural-language meal description → individual foods with estimated grams + nutrition.
// Goes through the task layer: the schema is enforced by the API, her usual foods + per-meal habits
// are injected automatically as context.

import type { DB } from '../db/index';
import { runTask } from './task';
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

export async function parseFood(db: DB, text: string): Promise<ParsedFood[]> {
  const out = await runTask(db, { ...TASK, globals: [...TASK.globals] }, { content: `Parse this into foods: "${text}".` });
  return (out?.items ?? []).filter((x) => x.grams > 0);
}
