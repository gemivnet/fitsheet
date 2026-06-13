// parseRecipe.ts — pasted recipe text → structured recipe fields for the gallery.

import type { DB } from '../db/index';
import { runTask } from './task';
import { ParsedRecipeSchema } from './schemas';

export interface ParsedRecipe {
  name: string | null;
  approx_kcal: number | null;
  cook_band: 'under_30' | '30_60' | 'over_60' | null;
  tags: string[];
  ingredients: string | null;
  steps: string | null;
}

const TASK = {
  name: 'parse-recipe',
  schema: ParsedRecipeSchema,
  system:
    'You turn pasted recipe text into structured fields for a home cook. approx_kcal is a rough ' +
    'per-serving estimate. cook_band is one of under_30 / 30_60 / over_60. tags are short, e.g. ' +
    '"low-cal", "high-protein", "vegetarian".',
};

export async function parseRecipe(db: DB, text: string): Promise<ParsedRecipe | null> {
  return runTask(db, TASK, { content: `Recipe text:\n${text}` });
}
