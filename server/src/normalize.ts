// normalize.ts — one-time-ish cleanup run at boot. Title-cases existing restaurant values so old
// mixed-case data ("chipotle" vs "Chipotle") merges to one canonical name, and fixes the
// denormalized "eating out" names already in the diary (casing + a brand the AI stuttered into
// the item). All idempotent — a clean row is left untouched.

import type { DB } from './db/index';
import { cleanDiningName, stripRestaurantPrefix, titleCase } from './util';

const TABLES = ['foods', 'restaurant_components', 'restaurant_menu'];

export function normalizeRestaurants(db: DB): void {
  for (const tbl of TABLES) {
    const rows = db.prepare(`SELECT DISTINCT restaurant FROM ${tbl} WHERE restaurant IS NOT NULL AND restaurant != ''`).all() as { restaurant: string }[];
    for (const { restaurant } of rows) {
      const norm = titleCase(restaurant);
      if (norm === restaurant) continue;
      try {
        db.prepare(`UPDATE ${tbl} SET restaurant = ? WHERE restaurant = ?`).run(norm, restaurant);
      } catch {
        // a UNIQUE(restaurant, …) collision means the normalized rows already exist — drop the
        // old-cased duplicates so the canonical ones win.
        db.prepare(`DELETE FROM ${tbl} WHERE restaurant = ?`).run(restaurant);
      }
    }
  }

  normalizeDiningNames(db);
}

// Fix names that were stored before dining names were canonicalized at log time.
function normalizeDiningNames(db: DB): void {
  // 1) diary rows are "Restaurant · Item": title-case the restaurant + de-stutter the item.
  const composed = db.prepare("SELECT id, name FROM food_log WHERE eating_out = 1 AND name LIKE '% · %'").all() as { id: number; name: string }[];
  const updLog = db.prepare('UPDATE food_log SET name = ? WHERE id = ?');
  for (const r of composed) {
    const fixed = cleanDiningName(r.name);
    if (fixed !== r.name) updLog.run(fixed, r.id);
  }

  // 2) bare diary rows that are just a (lower-cased) restaurant name → title-case them. Only when
  //    the name actually matches a known restaurant, so a saved-order quick-log like "ShackBurger"
  //    (no restaurant prefix) is never mangled.
  const restaurants = new Set(
    (db.prepare("SELECT DISTINCT restaurant FROM foods WHERE restaurant IS NOT NULL AND restaurant != ''").all() as { restaurant: string }[]).map((r) => r.restaurant.toLowerCase()),
  );
  const bare = db.prepare("SELECT id, name FROM food_log WHERE eating_out = 1 AND name NOT LIKE '% · %'").all() as { id: number; name: string }[];
  for (const r of bare) {
    if (restaurants.has(r.name.toLowerCase())) {
      const fixed = titleCase(r.name);
      if (fixed !== r.name) updLog.run(fixed, r.id);
    }
  }

  // 3) saved orders in the foods table: drop a brand the AI repeated in the order name.
  const foods = db.prepare("SELECT id, name, restaurant FROM foods WHERE eating_out = 1 AND restaurant IS NOT NULL AND restaurant != ''").all() as { id: number; name: string; restaurant: string }[];
  const updFood = db.prepare('UPDATE foods SET name = ? WHERE id = ?');
  for (const r of foods) {
    const fixed = stripRestaurantPrefix(r.name, r.restaurant);
    if (fixed !== r.name) updFood.run(fixed, r.id);
  }
}
