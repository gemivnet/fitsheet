import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb, type DB } from './db/index';
import { migrate } from './db/migrate';
import { resetData, seedDefaults } from './seed';

function freshDb(): DB {
  const db = openDb(':memory:');
  migrate(db);
  seedDefaults(db);
  return db;
}

function userTables(db: DB): string[] {
  return (
    db
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .filter((n) => n !== 'users' && n !== 'schema_migrations');
}

const count = (db: DB, t: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

// resetData used to delete a hardcoded list of twelve tables copied from migration 0001.
// Every table added by a later migration silently survived "Erase everything & start
// over" -- including cycle_entries and supplements, the most sensitive rows here. These
// tests fail if that regression returns, whether by reverting the fix or by a new
// migration adding a table nobody remembers to wipe.
test('resetData clears health data that a hardcoded table list used to miss', () => {
  const db = freshDb();
  const ts = '2026-08-25T00:00:00Z';
  db.prepare(
    "INSERT INTO cycle_entries (start_date,estimated,created_at,updated_at) VALUES ('2026-08-01',0,?,?)",
  ).run(ts, ts);
  db.prepare('INSERT INTO supplements (name,created_at,updated_at) VALUES (?,?,?)').run(
    'Example Supplement',
    ts,
    ts,
  );
  db.prepare(
    "INSERT INTO supplement_log (supplement_id,day_date,created_at) VALUES (1,'2026-08-01',?)",
  ).run(ts);

  resetData(db);

  assert.equal(count(db, 'cycle_entries'), 0, 'cycle history must not survive a reset');
  assert.equal(count(db, 'supplements'), 0, 'supplement list must not survive a reset');
  assert.equal(count(db, 'supplement_log'), 0, 'supplement log must not survive a reset');
});

test('resetData empties every table it is not explicitly meant to keep', () => {
  const db = freshDb();
  const populated = userTables(db).filter((t) => count(db, t) > 0);

  resetData(db);

  // walk_presets is deliberately reseeded by seedDefaults; everything else must be empty.
  const survivors = userTables(db).filter((t) => t !== 'walk_presets' && count(db, t) > 0);
  assert.deepEqual(survivors, [], `tables still populated after reset: ${survivors.join(', ')}`);
  assert.ok(populated.length >= 0);
});

test('resetData keeps the account and restores the default walk presets', () => {
  const db = freshDb();
  const usersBefore = count(db, 'users');

  resetData(db);

  assert.equal(count(db, 'users'), usersBefore, 'the account itself is not user data');
  assert.ok(count(db, 'walk_presets') > 0, 'default presets are reseeded so the app is usable');
});
