// schemas.ts — zod validation for everything the AI sends back. Deliberately LOOSE:
// numbers coerce from strings, non-load-bearing fields fall back to safe defaults via
// .catch(), and only the essentials (a name, a usable number) can fail a record. A failed
// parse degrades to null/[] at the call site — never a crash, never silent garbage.

import { z } from 'zod';

const num = z.coerce.number();
const numOr = (fallback: number) => z.coerce.number().catch(fallback);

export const ParsedFoodSchema = z.object({
  name: z.string().min(1),
  grams: num,
  kcal: num,
  protein_g: numOr(0),
  carb_g: numOr(0),
  fat_g: numOr(0),
});
export const ParsedFoodArraySchema = z.array(ParsedFoodSchema);
// Object root for structured outputs (the API constrains the whole reply to this shape).
export const ParsedFoodResultSchema = z.object({ items: z.array(ParsedFoodSchema) });

export const ParsedRecipeSchema = z.object({
  name: z.string().min(1).nullable().catch(null),
  approx_kcal: z.coerce.number().nullable().catch(null),
  cook_band: z.enum(['under_30', '30_60', 'over_60']).nullable().catch(null),
  tags: z.array(z.string()).catch([]),
  ingredients: z.string().nullable().catch(null),
  steps: z.string().nullable().catch(null),
});

const macroBlock = z
  .object({ kcal: num, protein_g: numOr(0), carb_g: numOr(0), fat_g: numOr(0) })
  .nullable()
  .catch(null);

export const ExtractedNutritionSchema = z.object({
  name: z.string().nullable().catch(null),
  serving_g: z.coerce.number().nullable().catch(null),
  serving_label: z.string().nullable().catch(null),
  per_serving: macroBlock,
  per_100g: macroBlock,
  confidence: z.enum(['high', 'medium', 'low']).catch('low'),
});

export const RestaurantItemSchema = z.object({
  name: z.string().min(1),
  components: z.array(
    z.object({
      name: z.string().min(1),
      category: z.string().catch('other'),
      grams: numOr(0),
      kcal: num,
      protein_g: numOr(0),
      carb_g: numOr(0),
      fat_g: numOr(0),
      // strict boolean on purpose: coerce.boolean() turns a missing field into false,
      // but "not mentioned" should mean "included by default" (matches cleanComponents)
      default_on: z.boolean().catch(true),
    }),
  ),
  note: z.string().nullable().catch(null),
  confidence: z.enum(['published', 'estimated']).catch('estimated'),
});
