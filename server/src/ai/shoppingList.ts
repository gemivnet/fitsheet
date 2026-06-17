// shoppingList.ts — turn a meal plan's raw ingredient lines into a deduped shopping list grouped by
// store section. No personal context needed; it's a tidy-up of text she already has.

import type { DB } from '../db/index';
import { runTask } from './task';
import { ShoppingListSchema } from './schemas';
import type { z } from 'zod';

export type ShoppingList = z.infer<typeof ShoppingListSchema>;

const SYSTEM =
  'You turn a list of recipe ingredient lines (which may repeat across meals) into a practical grocery ' +
  'shopping list. Combine duplicates (sum amounts when sensible), drop pantry staples that everyone ' +
  'has (salt, pepper, water), and group items under short store sections (e.g. Produce, Meat & fish, ' +
  'Dairy & eggs, Bakery, Pantry, Frozen, Other). Keep item names short and shopper-friendly.';

export async function buildShoppingList(db: DB, ingredients: string[]): Promise<ShoppingList | null> {
  const clean = ingredients.map((s) => s.trim()).filter(Boolean).slice(0, 300);
  if (!clean.length) return { sections: [] };
  return runTask(
    db,
    { name: 'shopping-list', schema: ShoppingListSchema, model: 'fast', system: SYSTEM, maxTokens: 1500 },
    { content: `Ingredients from her meal plan:\n${clean.join('\n')}\n\nProduce the grouped shopping list.` },
  );
}
