// generateRecipe.ts — the reverse of importing: cook FROM a target. Given a calorie/protein target
// (or "use what's left today") and an optional craving, draft a simple recipe leaning on the foods
// she actually eats. Returns the same ParsedRecipe shape the importer uses, so the editor fills in.

import type { DB } from '../db/index';
import { runTask } from './task';
import { ParsedRecipeSchema } from './schemas';
import { daySummary } from '../routes/foodLog';
import { getSettings } from '../settings';
import { todayStr } from '../util';
import type { z } from 'zod';

export type GeneratedRecipe = z.infer<typeof ParsedRecipeSchema>;

export interface GenerateRecipeOpts {
  kcal?: number;
  protein_g?: number;
  useRemaining?: boolean;
  craving?: string;
  date?: string;
}

const SYSTEM =
  'You create ONE simple, realistic recipe that hits a target, leaning on ingredients she likely has ' +
  'and foods she actually eats. Return: a short name, approx_kcal (for one serving), a cook_band, a ' +
  'few tags, ingredients (one per line with rough amounts), and steps (a few short lines). Keep it ' +
  'genuinely easy and close to the calorie/protein target. Never shame; just be helpful.';

export async function generateRecipe(db: DB, opts: GenerateRecipeOpts): Promise<GeneratedRecipe | null> {
  const date = opts.date ?? todayStr();
  const s = getSettings(db);
  let target: string;
  if (opts.useRemaining) {
    const day = daySummary(db, date);
    const remaining = Math.round(day.banking ? day.adjusted_remaining : day.remaining);
    target = `Fit roughly the ${remaining} kcal she has left today, with protein toward her goal (${s.protein_goal_g} g/day).`;
  } else {
    const p = opts.protein_g ? `, about ${Math.round(opts.protein_g)} g protein` : '';
    target = `About ${Math.round(opts.kcal || 500)} kcal${p} for one serving.`;
  }
  const craving = opts.craving?.trim() ? `\nShe's in the mood for: ${opts.craving.trim()}.` : '';
  return runTask(
    db,
    { name: 'generate-recipe', schema: ParsedRecipeSchema, model: 'fast', globals: ['goals', 'topFoods', 'mealHabits'], system: SYSTEM, maxTokens: 1000 },
    { content: `Create a recipe. Target: ${target}${craving}`, date },
  );
}
