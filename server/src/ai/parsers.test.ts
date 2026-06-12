import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanSuffix } from './complete';
import { cleanComponents, salvageObjects } from './restaurantItem';

test('salvageObjects keeps complete objects from a truncated stream', () => {
  const truncated = '[{"name":"Rice","kcal":210},{"name":"Chicken","kcal":180},{"name":"Gua';
  const out = salvageObjects(truncated);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'Rice');
  assert.equal(out[1].name, 'Chicken');
});

test('salvageObjects handles braces inside strings', () => {
  const out = salvageObjects('[{"name":"Bowl {large}","kcal":500}]');
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Bowl {large}');
});

test('cleanComponents drops non-finite kcal and clamps negatives', () => {
  const out = cleanComponents([
    { name: 'Rice', kcal: 210, grams: -5, protein_g: 4, carb_g: 45, fat_g: 0.5 },
    { name: 'Bad', kcal: 'NaN-ish' },
    null,
    { kcal: 100 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].grams, 0);
  assert.equal(out[0].protein_g, 4);
});

test('cleanSuffix keeps possessives and drops prose', () => {
  assert.equal(cleanSuffix('Trader', "Trader Joe's Orange Chicken"), " Joe's Orange Chicken");
  assert.equal(cleanSuffix('Sweet', '"Sweet potato"'), ' potato');
  assert.equal(cleanSuffix('chick', 'Chicken (grilled)'), '');
  assert.equal(cleanSuffix('x', 'Sorry, I cannot help with that.'), '');
  assert.equal(cleanSuffix('big', 'Big Mac'), ' Mac');
  assert.equal(cleanSuffix('exact', 'exact'), '');
  assert.equal(cleanSuffix('a', `a${'b'.repeat(40)}`), '');
});
