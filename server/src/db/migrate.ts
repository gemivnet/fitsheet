// migrate.ts — applies numbered .sql migrations once, idempotently, inside a transaction.
// Runnable standalone (`tsx src/db/migrate.ts`) and on server boot.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowIso } from '../util';
import { openDb, type DB } from './index';

const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function migrate(db: DB): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT filename FROM schema_migrations').all() as { filename: string }[]).map((r) => r.filename),
  );
  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(MIG_DIR, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)').run(f, nowIso());
    })();
    console.log(`[migrate] applied ${f}`);
  }
}

// Run directly: `tsx src/db/migrate.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb();
  migrate(db);
  console.log('[migrate] up to date');
  db.close();
}
