// parseRecipe.ts — pasted recipe text → structured recipe fields for the gallery.

import { claudeText, extractJson } from './client';
import { ParsedRecipeSchema } from './schemas';

export interface ParsedRecipe {
  name: string | null;
  approx_kcal: number | null;
  cook_band: 'under_30' | '30_60' | 'over_60' | null;
  tags: string[];
  ingredients: string | null;
  steps: string | null;
}

export async function parseRecipe(text: string): Promise<ParsedRecipe | null> {
  const out = await claudeText({
    system:
      'You turn pasted recipe text into structured fields for a home cook. approx_kcal is a rough ' +
      'per-serving estimate. cook_band is one of under_30 / 30_60 / over_60. tags are short, e.g. ' +
      '"low-cal", "high-protein", "vegetarian".',
    content:
      `Recipe text:\n${text}\n\n` +
      'Reply ONLY JSON: {"name": string, "approx_kcal": number|null, "cook_band": "under_30"|"30_60"|"over_60"|null, ' +
      '"tags": string[], "ingredients": string, "steps": string}',
    maxTokens: 1200,
  });
  const parsed = ParsedRecipeSchema.safeParse(extractJson(out));
  if (!parsed.success) {
    console.warn('[ai] parse-recipe reply failed validation:', parsed.error.issues.slice(0, 3));
    return null;
  }
  return parsed.data;
}
