import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExtractedNutritionSchema, ParsedFoodArraySchema, ParsedRecipeSchema, RestaurantItemSchema } from './schemas';

test('parsed foods coerce string numbers and default missing macros', () => {
  const r = ParsedFoodArraySchema.safeParse([{ name: 'Rice', grams: '120', kcal: '156', fat_g: 'huh' }]);
  assert.ok(r.success);
  assert.equal(r.data[0].grams, 120);
  assert.equal(r.data[0].fat_g, 0); // garbage degrades, doesn't fail the record
});

test('parsed foods fail hard on a missing name or unusable number', () => {
  assert.equal(ParsedFoodArraySchema.safeParse([{ grams: 100, kcal: 100 }]).success, false);
  assert.equal(ParsedFoodArraySchema.safeParse([{ name: 'x', grams: 'not-a-number', kcal: 100 }]).success, false);
  assert.equal(ParsedFoodArraySchema.safeParse('sorry, I cannot parse that').success, false);
});

test('recipe degrades gracefully: bad cook_band → null, bad tags → []', () => {
  const r = ParsedRecipeSchema.safeParse({ name: 'Chili', approx_kcal: 320, cook_band: 'forever', tags: 'spicy', ingredients: 'beans', steps: 'cook' });
  assert.ok(r.success);
  assert.equal(r.data.cook_band, null);
  assert.deepEqual(r.data.tags, []);
});

test('nutrition label: unreadable confidence falls back to low', () => {
  const r = ExtractedNutritionSchema.safeParse({ name: null, serving_g: '30', serving_label: null, per_serving: { kcal: 110 }, per_100g: null, confidence: 'very sure' });
  assert.ok(r.success);
  assert.equal(r.data.confidence, 'low');
  assert.equal(r.data.serving_g, 30);
  assert.equal(r.data.per_serving?.protein_g, 0);
});

test('restaurant item keeps components and defaults confidence to estimated', () => {
  const r = RestaurantItemSchema.safeParse({ name: 'Bowl', components: [{ name: 'Rice', kcal: '210' }], note: null });
  assert.ok(r.success);
  assert.equal(r.data.confidence, 'estimated');
  assert.equal(r.data.components[0].kcal, 210);
  assert.equal(r.data.components[0].default_on, true);
});
