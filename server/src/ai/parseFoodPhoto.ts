// parseFoodPhoto.ts — read a photo of her food notes (handwritten or typed) into individual foods.
// Same output shape as parseFood (the text path), so the app reuses the confirm-and-log UI.

import { readFileSync } from 'node:fs';
import { claudeText, extractJson, imageBlock } from './client';
import type { ParsedFood } from './parseFood';

export async function parseFoodPhoto(filePath: string, mediaType: string, personalFoods = ''): Promise<ParsedFood[]> {
  const base64 = readFileSync(filePath).toString('base64');
  const hint = personalFoods ? `\nThis person commonly logs these foods (use the matching name and their usual portion when it fits): ${personalFoods}.` : '';
  const out = await claudeText({
    system:
      "You read a photo of someone's food notes or diary (handwritten or typed) and convert it into " +
      'individual foods with realistic gram amounts and nutrition. Estimate typical portion sizes when ' +
      'amounts are not written. Be reasonable, not exact. Ignore anything that is not food.',
    content: [
      imageBlock(base64, mediaType),
      {
        type: 'text',
        text:
          `List the foods in this photo.${hint}\nReply ONLY a JSON array, no prose: ` +
          '[{"name": string, "grams": number, "kcal": number, "protein_g": number, "carb_g": number, "fat_g": number}]',
      },
    ],
    maxTokens: 1024,
  });
  const arr = extractJson<ParsedFood[]>(out);
  return Array.isArray(arr) ? arr.filter((x) => x && x.name && Number(x.grams) > 0) : [];
}
