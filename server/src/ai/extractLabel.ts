// extractLabel.ts — Claude vision reads a nutrition-label photo into structured nutrition.
// Gated by ANTHROPIC_API_KEY (route returns 503 if absent). Manual entry is the fallback.

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { config } from '../config';

export interface ExtractedNutrition {
  name: string | null;
  serving_g: number | null;
  serving_label: string | null;
  per_serving: { kcal: number; protein_g: number; carb_g: number; fat_g: number } | null;
  per_100g: { kcal: number; protein_g: number; carb_g: number; fat_g: number } | null;
  confidence: 'high' | 'medium' | 'low';
}

const SYSTEM =
  'You read nutrition labels from photos and return ONLY structured JSON. Be accurate; never invent ' +
  'numbers you cannot read. If only per-serving OR per-100g is printed, derive the other from the ' +
  'serving size in grams. Use null for any field you cannot read confidently.';

const USER =
  'Extract the nutrition facts from this label. Reply with ONLY a JSON object of this exact shape:\n' +
  '{"name": string|null, "serving_g": number|null, "serving_label": string|null, ' +
  '"per_serving": {"kcal": number, "protein_g": number, "carb_g": number, "fat_g": number}|null, ' +
  '"per_100g": {"kcal": number, "protein_g": number, "carb_g": number, "fat_g": number}|null, ' +
  '"confidence": "high"|"medium"|"low"}. ' +
  'Set confidence to "low" if the label is blurry or partially unreadable.';

export async function extractLabel(filePath: string, mediaType: string): Promise<ExtractedNutrition | null> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const base64 = readFileSync(filePath).toString('base64');
  const res = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: base64 } },
          { type: 'text', text: USER },
        ],
      },
    ],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as ExtractedNutrition;
  } catch {
    return null;
  }
}
