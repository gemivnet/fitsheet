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

// ── meal plan ────────────────────────────────────────────────────────────────
export const PlannedMealSchema = z.object({
  slot: z.enum(['breakfast', 'lunch', 'dinner', 'snacks']).catch('snacks'),
  name: z.string().min(1),
  kcal: num,
  protein_g: numOr(0),
  carb_g: numOr(0),
  fat_g: numOr(0),
  ingredients: z.array(z.string()).catch([]),
  steps: z.string().catch(''), // a one-line method
});
export const MealPlanDaySchema = z.object({
  label: z.string(),
  meals: z.array(PlannedMealSchema),
});
export const MealPlanSchema = z.object({ days: z.array(MealPlanDaySchema) });

// AI weekly-goal suggestions. `auto` ties a goal to data we can measure (so it ticks itself).
export const WeeklyGoalSuggestionsSchema = z.object({
  goals: z.array(
    z.object({
      text: z.string().min(1),
      auto: z.enum(['log_daily', 'under_goal', 'walks', 'weigh_in', 'none']).catch('none'),
      target: numOr(0),
    }),
  ),
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
  confidence: z.enum(['official', 'published', 'estimated']).catch('estimated'),
});

// ── items-first dining ───────────────────────────────────────────────────────
// A modifier is a part of an item ("Sesame Bun", "Beef Patty") or an optional add-on ("Add Bacon",
// "Extra Cheese") with its own nutrition delta, so customizing an item = toggling modifiers.
export const RestaurantModifierSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['part', 'addon']).catch('part'),
  grams: numOr(0),
  kcal: numOr(0),
  protein_g: numOr(0),
  carb_g: numOr(0),
  fat_g: numOr(0),
  default_on: z.boolean().catch(true),
});
export const RestaurantMenuItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().catch('other'),
  grams: numOr(0),
  kcal: num,
  protein_g: numOr(0),
  carb_g: numOr(0),
  fat_g: numOr(0),
  modifiers: z.array(RestaurantModifierSchema).catch([]),
  confidence: z.enum(['official', 'published', 'estimated']).catch('estimated'),
});
export const RestaurantMenuSchema = z.object({ items: z.array(RestaurantMenuItemSchema) });
