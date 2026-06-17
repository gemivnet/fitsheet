// parseFoodPhoto.ts — read a photo of her food notes (handwritten or typed) into individual foods.
// Same output shape as parseFood, so the app reuses the confirm-and-log UI.

import { readFileSync } from 'node:fs';
import type { DB } from '../db/index';
import { imageBlock } from './client';
import { runTask } from './task';
import { recentSlotFoods } from './context';
import { ParsedFoodResultSchema } from './schemas';
import { CLARIFY_RULE, type ParsedFood } from './parseFood';

const TASK = {
  name: 'parse-food-photo',
  globals: ['topFoods', 'mealHabits'] as const,
  schema: ParsedFoodResultSchema,
  system:
    'You read a food photo and convert it into individual foods with realistic gram amounts and ' +
    'nutrition. The photo is EITHER a written list of foods (handwritten or typed notes/diary) OR a ' +
    'picture of an actual plate/meal — handle both: read the list if it is one, otherwise identify the ' +
    'foods you can see and estimate sensible portions from the plate. Estimate typical portion sizes ' +
    'when amounts are not given. When a food matches one she logs often, use that name and her usual ' +
    'portion. Be reasonable, not exact. Ignore anything that is not food. ' +
    CLARIFY_RULE,
};

export async function parseFoodPhoto(db: DB, filePath: string, mediaType: string, slot?: string): Promise<ParsedFood[]> {
  const base64 = readFileSync(filePath).toString('base64');
  const recent = slot ? recentSlotFoods(db, slot) : '';
  const hint = recent ? ` Lately at ${slot} she's logged: ${recent}. If something in the photo plausibly matches one of these, use that exact item and its brand.` : '';
  const out = await runTask(
    db,
    { ...TASK, globals: [...TASK.globals] },
    { content: [imageBlock(base64, mediaType), { type: 'text', text: `List the foods in this photo.${hint}` }] },
  );
  return (out?.items ?? []).filter((x) => x.grams > 0);
}
