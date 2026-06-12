import { Router } from 'express';
import { buildAnalytics } from '../analytics';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { isDayStr } from '../util';

export function analyticsRouter(db: DB): Router {
  const r = Router();
  // Streaks and the TDEE window anchor to the client's local day when provided.
  r.get('/summary', (req, res) => res.json(buildAnalytics(db, getSettings(db), isDayStr(req.query.date) ? req.query.date : undefined)));
  return r;
}
