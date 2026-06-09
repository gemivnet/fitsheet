import { Router } from 'express';
import { buildAnalytics } from '../analytics';
import type { DB } from '../db/index';
import { getSettings } from '../settings';

export function analyticsRouter(db: DB): Router {
  const r = Router();
  r.get('/summary', (_req, res) => res.json(buildAnalytics(db, getSettings(db))));
  return r;
}
