// restaurantItem.ts — "build your item" for a chain restaurant order. Given a restaurant and what
// she's getting, break it into the build-your-own components (base, protein, each topping/side),
// each with calories/macros and an estimated portion weight, so she ticks what she actually got.

import { claudeText, extractJson } from './client';

export interface RestaurantComponent {
  name: string;
  category: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  default_on: boolean;
}
export interface RestaurantItem {
  name: string;
  components: RestaurantComponent[];
  note?: string | null;
}

export async function restaurantItem(restaurant: string, item: string): Promise<RestaurantItem | null> {
  const out = await claudeText({
    system:
      'You help someone log a restaurant meal using the chain\'s ACTUAL OFFICIAL PUBLISHED nutrition. ' +
      'Most US chains (McDonald\'s, Chipotle, Subway, Chick-fil-A, Taco Bell, etc.) publish full nutrition ' +
      'for every menu item and build-your-own component — reproduce those real published numbers, not rough ' +
      'guesses. Given a chain restaurant and the order, break it into the individual build-your-own ' +
      'components a person assembles or receives — the base, the protein, then EACH topping, side, sauce, ' +
      'and add-on as a separate line. For one standard portion as served, give the published calories and ' +
      'protein/carb/fat in grams, plus the portion weight in grams. Mark components typically included by ' +
      'default with default_on:true, and optional add-ons (guac, chips, extra cheese, large size, etc.) ' +
      'false. Give each component a category from: base, protein, beans, topping, salsa, cheese, side, ' +
      'sauce, other. Only include parts of this order plus what it standardly comes with — never invent ' +
      'unrelated items. If a value is genuinely not published, give your best estimate but keep it realistic.',
    content:
      `Restaurant: ${restaurant}\nOrder: ${item}\n\n` +
      'Reply ONLY JSON, no prose: ' +
      '{"name": string, "components": [{"name": string, "category": string, "grams": number, "kcal": number, "protein_g": number, "carb_g": number, "fat_g": number, "default_on": boolean}], "note": string}',
    maxTokens: 1500,
  });
  const obj = extractJson<RestaurantItem>(out);
  if (!obj || !Array.isArray(obj.components)) return null;
  obj.components = obj.components
    .filter((c) => c && c.name && Number.isFinite(Number(c.kcal)))
    .map((c) => ({
      name: String(c.name),
      category: String(c.category || 'other').toLowerCase(),
      grams: Math.max(0, Math.round(Number(c.grams) || 0)),
      kcal: Math.max(0, Math.round(Number(c.kcal) || 0)),
      protein_g: Math.max(0, Math.round(Number(c.protein_g) || 0)),
      carb_g: Math.max(0, Math.round(Number(c.carb_g) || 0)),
      fat_g: Math.max(0, Math.round(Number(c.fat_g) || 0)),
      default_on: c.default_on !== false,
    }));
  if (!obj.components.length) return null;
  return obj;
}
