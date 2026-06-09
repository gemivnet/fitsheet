// parseFood.ts — natural-language meal description → individual foods with estimated grams + nutrition.

import { claudeText, extractJson } from './client';

export interface ParsedFood {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
}

export async function parseFood(text: string): Promise<ParsedFood[]> {
  const out = await claudeText({
    system:
      'You convert a casual meal description into individual foods with realistic gram amounts and ' +
      'nutrition. Estimate typical portion sizes when amounts are not given. Be reasonable, not exact.',
    content:
      `Parse this into foods: "${text}".\n` +
      'Reply ONLY a JSON array, no prose: ' +
      '[{"name": string, "grams": number, "kcal": number, "protein_g": number, "carb_g": number, "fat_g": number}]',
    maxTokens: 1024,
  });
  const arr = extractJson<ParsedFood[]>(out);
  return Array.isArray(arr) ? arr.filter((x) => x && x.name && Number(x.grams) > 0) : [];
}
