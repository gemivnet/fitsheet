// seed.ts — minimal, real-first. Only seeds the two walk presets (so the one-tap "completed a
// regular walk" works immediately). No demo/sample data. resetData() wipes everything clean.

import type { DB } from './db/index';
import { nowIso } from './util';

const count = (db: DB, table: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

export function seedDefaults(db: DB): void {
  const ts = nowIso();
  if (count(db, 'walk_presets') === 0) {
    const ins = db.prepare('INSERT INTO walk_presets (label,default_minutes,default_distance,sort_order,created_at) VALUES (?,?,?,?,?)');
    ins.run('Regular walk', 30, 1.4, 0, ts); // ~30 min at her usual pace
    ins.run('Long loop', 45, 2.2, 1, ts); // her 2.2 mi loop, ~45 min
  }
  // existing installs: make sure the Long loop carries its real distance (idempotent backfill)
  db.prepare('UPDATE walk_presets SET default_distance = 2.2, default_minutes = 45 WHERE label = ? AND default_distance IS NULL').run('Long loop');
}

export function resetData(db: DB): void {
  const tables = ['food_log', 'foods', 'weight_photos', 'weight_entries', 'workouts', 'walk_log', 'walk_presets', 'notes', 'recipes', 'milestones', 'audit_log', 'settings'];
  db.transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  })();
  seedDefaults(db);
}
