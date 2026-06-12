// server.ts — builds the Express app. No auth in v1 (Tailscale is the boundary).

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { DB } from './db/index';
import { aiRouter } from './routes/ai';
import { analyticsRouter } from './routes/analytics';
import { dashboardRouter } from './routes/dashboard';
import { devRouter } from './routes/dev';
import { foodLogRouter } from './routes/foodLog';
import { foodsRouter } from './routes/foods';
import { notesRouter } from './routes/notes';
import { offRouter } from './routes/openfoodfacts';
import { recipesRouter } from './routes/recipes';
import { restaurantsRouter } from './routes/restaurants';
import { settingsRouter } from './routes/settings';
import { supplementsRouter } from './routes/supplements';
import { walksRouter } from './routes/walks';
import { weightRouter } from './routes/weight';
import { weightPhotosRouter } from './routes/weightPhotos';
import { workoutsRouter } from './routes/workouts';

export function buildServer(db: DB) {
  const app = express();
  // Same-origin in production (the server serves the PWA); CORS_ORIGIN can pin it down,
  // the permissive default keeps Expo dev on another port working.
  app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : undefined));
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'fitsheet' }));

  app.use('/api/settings', settingsRouter(db));
  app.use('/api/foods', foodsRouter(db));
  app.use('/api/food-log', foodLogRouter(db));
  app.use('/api/weight', weightRouter(db));
  app.use('/api/weight-photos', weightPhotosRouter(db));
  app.use('/api/workouts', workoutsRouter(db));
  app.use('/api/walks', walksRouter(db));
  app.use('/api/notes', notesRouter(db));
  app.use('/api/supplements', supplementsRouter(db));
  app.use('/api/recipes', recipesRouter(db));
  app.use('/api/restaurants', restaurantsRouter(db));
  app.use('/api/analytics', analyticsRouter(db));
  app.use('/api/ai', aiRouter(db));
  app.use('/api/openfoodfacts', offRouter());
  app.use('/api/dashboard', dashboardRouter(db));
  app.use('/api/dev', devRouter(db));

  // Serve the built web app (PWA) from the same origin as the API. The app is built to
  // app/dist (or WEB_DIR); if it isn't built yet, these are harmless no-ops.
  const webDir = process.env.WEB_DIR || resolve(process.cwd(), '..', 'app', 'dist');
  app.use(express.static(webDir));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    const index = join(webDir, 'index.html');
    if (existsSync(index)) return res.sendFile(index);
    next();
  });

  // Unknown API paths get a JSON 404 (instead of the HTML fallthrough).
  app.use('/api', (_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[error]', err);
    // Bad uploads (wrong type / too big) are a client problem, not a server crash.
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('only image uploads') || msg.includes('File too large')) return res.status(400).json({ error: 'bad_upload' });
    res.status(500).json({ error: 'server_error' });
  });

  return app;
}
