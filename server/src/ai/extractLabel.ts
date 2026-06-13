// extractLabel.ts — Claude vision reads a nutrition-label photo into structured nutrition.
// Gated by ANTHROPIC_API_KEY (route returns 503 if absent). Manual entry is the fallback.

import { readFileSync } from 'node:fs';
import type { DB } from '../db/index';
import { imageBlock } from './client';
import { runTask } from './task';
import { ExtractedNutritionSchema } from './schemas';

export interface ExtractedNutrition {
  name: string | null;
  serving_g: number | null;
  serving_label: string | null;
  per_serving: { kcal: number; protein_g: number; carb_g: number; fat_g: number } | null;
  per_100g: { kcal: number; protein_g: number; carb_g: number; fat_g: number } | null;
  confidence: 'high' | 'medium' | 'low';
}

const TASK = {
  name: 'extract-label',
  schema: ExtractedNutritionSchema,
  system:
    'You read nutrition labels from photos. Be accurate; never invent numbers you cannot read. If ' +
    'only per-serving OR per-100g is printed, derive the other from the serving size in grams. Use ' +
    'null for any field you cannot read confidently, and set confidence to "low" if the label is ' +
    'blurry or partially unreadable.',
};

export async function extractLabel(db: DB, filePath: string, mediaType: string): Promise<ExtractedNutrition | null> {
  const base64 = readFileSync(filePath).toString('base64');
  return runTask(db, TASK, { content: [imageBlock(base64, mediaType), { type: 'text', text: 'Extract the nutrition facts from this label.' }] });
}
