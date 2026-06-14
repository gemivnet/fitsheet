// parseRecipe.ts — a recipe from pasted text, a web link, or a PDF → structured fields.

import { readFileSync } from 'node:fs';
import type { DB } from '../db/index';
import { documentBlock } from './client';
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
    'You turn a recipe (pasted text, a web page, or a PDF) into structured fields for a home cook. ' +
    'approx_kcal is a rough per-serving estimate. cook_band is one of under_30 / 30_60 / over_60. tags ' +
    'are short, e.g. "low-cal", "high-protein", "vegetarian". Pull the real ingredient list and steps; ' +
    'ignore site clutter, ads, and life stories.',
};

export async function parseRecipe(db: DB, text: string): Promise<ParsedRecipe | null> {
  return runTask(db, TASK, { content: `Recipe text:\n${text}` });
}

// Fetch a recipe page and parse it. http(s) only; bounded time + size; HTML stripped to text.
export async function parseRecipeFromUrl(db: DB, url: string): Promise<ParsedRecipe | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  let html = '';
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'fitsheet/1.0 (recipe import)' } });
    if (!r.ok) {
      console.warn(`[ai] recipe url fetch failed: ${r.status}`);
      return null;
    }
    html = (await r.text()).slice(0, 200_000);
  } catch (e) {
    console.warn('[ai] recipe url fetch error:', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
  const text = htmlToText(html).slice(0, 8000);
  if (!text.trim()) return null;
  return runTask(db, TASK, { content: `Recipe from ${url}:\n${text}` });
}

export async function parseRecipePdf(db: DB, filePath: string): Promise<ParsedRecipe | null> {
  const base64 = readFileSync(filePath).toString('base64');
  return runTask(db, TASK, { content: [documentBlock(base64), { type: 'text', text: 'Extract this recipe.' }] });
}

// crude but effective: drop scripts/styles, collapse tags to spaces, decode a few entities.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
