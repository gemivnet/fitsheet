// seed.ts — minimal, real-first. Only seeds the two walk presets (so the one-tap "completed a
// regular walk" works immediately). No demo/sample data. resetData() wipes everything clean.

import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { uploadsDir, type DB } from './db/index';
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

/** Tables that must survive a reset: the account itself and the migration bookkeeping. */
const RESET_KEEP = new Set(['users', 'schema_migrations']);

export function resetData(db: DB): void {
  // Enumerated at runtime, never hardcoded. The previous fixed list came from migration
  // 0001 and was never extended, so eight tables added later survived what the UI calls
  // "Erase everything & start over" -- among them cycle_entries, supplements and
  // supplement_log, which are the most sensitive rows in the database. Deriving the list
  // from sqlite_master means a new migration cannot reintroduce that gap.
  const tables = (
    db
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .filter((n) => !RESET_KEEP.has(n));

  db.transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  })();

  // Rows are only half of it: the image files stay on disk and outlive the DB rows,
  // including progress photos. Clear the upload directory in the same operation.
  try {
    const dir = uploadsDir();
    for (const entry of readdirSync(dir)) {
      try {
        rmSync(join(dir, entry), { recursive: true, force: true });
      } catch {
        // one undeletable file must not abort the reset
      }
    }
  } catch {
    // no uploads directory yet -- nothing to clear
  }

  seedDefaults(db);
}
