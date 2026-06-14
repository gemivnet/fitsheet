// restaurantItem.ts — "build your item" for a chain restaurant order. Given a restaurant and what
// she's getting, break it into the build-your-own components (base, protein, each topping/side),
// each with calories/macros and an estimated portion weight, so she ticks what she actually got.

import { claudeText } from './client';
import type { DB } from '../db/index';
import { stripRestaurantPrefix } from '../util';
import { runTask } from './task';
import { RestaurantItemSchema } from './schemas';

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
  /** 'official' = grounded on the chain's web-sourced nutrition; 'published' = reproduced from the
   * model's knowledge of real numbers; 'estimated' = best guess. */
  confidence?: 'official' | 'published' | 'estimated';
}

// Pull every COMPLETE {…} object out of a (possibly truncated) JSON array. Streamed menus can get
// cut off at the token limit; this keeps all the items that fully arrived instead of failing.
export function salvageObjects(text: string): any[] {
  const start = text.indexOf('[');
  const s = start >= 0 ? text.slice(start + 1) : text;
  const out: any[] = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let buf = '';
  for (const ch of s) {
    if (inStr) {
      buf += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      buf += ch;
      continue;
    }
    if (ch === '{') {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === '}') {
      depth--;
      buf += ch;
      if (depth === 0) {
        try {
          out.push(JSON.parse(buf));
        } catch {
          /* skip */
        }
        buf = '';
      }
      continue;
    }
    if (depth > 0) buf += ch;
  }
  return out;
}

export function cleanComponents(arr: any[]): RestaurantComponent[] {
  return arr
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
}

// The COMPLETE build-your-own menu for a chain (every protein/base/topping/side), so the library
// has all the options up front — not just the parts of orders she's built. Prompt is shared with
// the streaming route.
export const FULL_MENU_SYSTEM =
  'You build a per-restaurant menu so the user can log what they ate. FIRST decide the restaurant type:\n' +
  '• BUILD-YOUR-OWN chains (Chipotle, Subway, Cava, Qdoba, Sweetgreen, Moe\'s — bowl/sub/salad makers): ' +
  'list the individual build-your-own COMPONENTS (every base, protein, bean, salsa, topping, cheese, ' +
  'side, sauce) for one standard portion/scoop, and mark the ones a standard order includes default_on:true.\n' +
  '• FIXED-MENU chains (McDonald\'s, Wendy\'s, Burger King, Chick-fil-A, Taco Bell, Popeyes, Raising Cane\'s, ' +
  'In-N-Out, etc.): list the popular COMPLETE menu items as WHOLE items (e.g. "Big Mac", "10 pc Chicken ' +
  'McNuggets", "Medium Fries", "Spicy Chicken Sandwich", a Medium Coke) with their full published nutrition — ' +
  'do NOT break an item into ingredients. Mark everything default_on:false (the user picks what they ordered).\n' +
  'Use the chain\'s ACTUAL published nutrition. Give each a category — for fixed menus the item type ' +
  '(burger, chicken, sandwich, nuggets, side, drink, breakfast, dessert); for build-your-own (base, protein, ' +
  'beans, topping, salsa, cheese, side, sauce, other) — plus portion grams, calories, and protein/carb/fat ' +
  'grams. Be reasonably complete for the popular options. ' +
  'Name each item as it reads ON THE MENU, WITHOUT the restaurant or brand in front — "ShackBurger", ' +
  '"Cheese Fries", "Baconator", NOT "Shake Shack ShackBurger" or "Wendy\'s Baconator".';
export const fullMenuContent = (restaurant: string): string =>
  `Restaurant: ${restaurant}\n\n` +
  'Reply ONLY a JSON array, no prose: ' +
  '[{"name": string, "category": string, "grams": number, "kcal": number, "protein_g": number, "carb_g": number, "fat_g": number, "default_on": boolean}]';

export async function restaurantFullMenu(restaurant: string): Promise<RestaurantComponent[]> {
  const out = await claudeText({ system: FULL_MENU_SYSTEM, content: fullMenuContent(restaurant), maxTokens: 6000, timeoutMs: 120_000 });
  return cleanComponents(salvageObjects(out));
}

const ITEM_SYSTEM =
  'You help someone log a restaurant meal using the chain\'s ACTUAL OFFICIAL PUBLISHED nutrition — ' +
  'reproduce real published numbers, not rough guesses. Given a chain and the order, return its parts as ' +
  '"components". HOW you split it depends on the restaurant:\n' +
  '• BUILD-YOUR-OWN chains (Chipotle, Subway, Cava, Qdoba, bowl/sub/salad makers): break the order into ' +
  'the individual components a person assembles — base, protein, then EACH topping/side/sauce as its own ' +
  'line. Mark standard inclusions default_on:true and optional add-ons (guac, chips, extra cheese) false.\n' +
  '• FIXED-MENU chains (McDonald\'s, Wendy\'s, Chick-fil-A, Taco Bell, Burger King, etc.): each "component" ' +
  'is a WHOLE menu item the person ordered (e.g. "Big Mac", "Medium Fries") with its full nutrition — do ' +
  'NOT break items into ingredients. Mark each item default_on:true (they ordered it).\n' +
  'For each line give the published calories, protein/carb/fat grams, portion grams, and a category ' +
  '(build-your-own: base, protein, beans, topping, salsa, cheese, side, sauce, other; fixed: burger, ' +
  'chicken, sandwich, nuggets, side, drink, breakfast, dessert). Only include this order plus what it ' +
  'standardly comes with. If a value is genuinely not published, estimate realistically. Set ' +
  '"confidence" to "published" only when you are reproducing the chain\'s real published nutrition; ' +
  'for independent/local spots or anything you had to guess, set "confidence" to "estimated". ' +
  'Name the order and each component as they read ON THE MENU, WITHOUT the restaurant or brand in ' +
  'front: the order "name" should be "ShackBurger", not "Shake Shack ShackBurger"; a component ' +
  '"Cheese Fries", not "Shake Shack Cheese Fries". The restaurant is shown separately.';

export async function restaurantItem(db: DB, restaurant: string, item: string, menuNames: string[] = [], history: string[] = []): Promise<RestaurantItem | null> {
  // Menu-aware: when the restaurant already has a component menu, reuse those EXACT names so the
  // order's parts line up with the menu instead of creating near-duplicates.
  const menuHint = menuNames.length
    ? `\n\nThis restaurant already has these menu components — when a part of the order matches one, use its EXACT name from this list (verbatim), and only add a NEW component if the order truly includes something not listed:\n${menuNames.join(', ')}`
    : '';
  // Single-user bias: this specific person's usual order here → pre-tick HER actuals.
  const historyHint = history.length
    ? `\n\nThis specific person usually gets these here: ${history.join(', ')}. When the order is consistent with that, set default_on:true for those so HER usual is pre-selected.`
    : '';
  const parsed = await runTask(
    db,
    { name: 'restaurant-item', schema: RestaurantItemSchema, system: ITEM_SYSTEM, maxTokens: 1500 },
    { content: `Restaurant: ${restaurant}\nOrder: ${item}${menuHint}${historyHint}` },
  );
  if (!parsed) return null;
  // belt-and-suspenders: strip any brand the model still baked into names, so saved orders
  // and the reusable component library stay clean even if the prompt isn't obeyed.
  const obj: RestaurantItem = {
    ...parsed,
    name: stripRestaurantPrefix(parsed.name, restaurant),
    components: cleanComponents(parsed.components).map((c) => ({ ...c, name: stripRestaurantPrefix(c.name, restaurant) })),
  };
  if (!obj.components.length) return null;
  return obj;
}
