// normalize.ts — one-time-ish cleanup run at boot: Title-case existing restaurant values so old
// mixed-case data ("chipotle" vs "Chipotle") merges to a single canonical name. Idempotent.

import type { DB } from './db/index';
import { titleCase } from './util';

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
}
