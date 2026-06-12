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

const app = buildServer(db);
app.listen(config.port, () => {
  console.log(`[fitsheet] server listening on http://0.0.0.0:${config.port}`);
});
