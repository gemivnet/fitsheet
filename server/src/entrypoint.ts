// entrypoint.ts — boot: load env → open DB → migrate → seed defaults → serve.

import 'dotenv/config';
import { config } from './config';
import { openDb } from './db/index';
import { migrate } from './db/migrate';
import { normalizeRestaurants } from './normalize';
import { seedDefaults } from './seed';
import { buildServer } from './server';

const db = openDb();
migrate(db);
seedDefaults(db);
normalizeRestaurants(db);

// Keep the audit trail from growing without bound (it's a debugging aid, not a ledger).
try {
  db.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-180 days')").run();
} catch {
  /* table may not exist on a fresh boot before migrations created it — harmless */
}

const app = buildServer(db);
const server = app.listen(config.port, () => {
  console.log(`[fitsheet] server listening on http://0.0.0.0:${config.port}`);
});

// Clean shutdown: flush WAL + close the DB so docker stop / restarts never lose writes.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    // Don't hang forever on open keep-alive sockets.
    setTimeout(() => {
      db.close();
      process.exit(0);
    }, 3000).unref();
  });
}
