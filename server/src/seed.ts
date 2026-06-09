// seed.ts — minimal, real-first. Only seeds the two walk presets (so the one-tap "completed a
// regular walk" works immediately). No demo/sample data. resetData() wipes everything clean.

import type { DB } from './db/index';
import { nowIso } from './util';

const count = (db: DB, table: string): number => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

export function seedDefaults(db: DB): void {
  const ts = nowIso();
  if (count(db, 'walk_presets') === 0) {
    const ins = db.prepare('INSERT INTO walk_presets (label,default_minutes,default_distance,sort_order,created_at) VALUES (?,?,?,?,?)');
    ins.run('Regular walk', 30, null, 0, ts);
    ins.run('Long loop', 50, null, 1, ts);
  }
}

export function resetData(db: DB): void {
  const tables = ['food_log', 'foods', 'weight_photos', 'weight_entries', 'workouts', 'walk_log', 'walk_presets', 'notes', 'recipes', 'milestones', 'audit_log', 'settings'];
  db.transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  })();
  seedDefaults(db);
}
