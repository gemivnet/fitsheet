import { Router } from 'express';
import type { DB } from '../db/index';
import { resetData } from '../seed';

// Utility endpoint: wipe all data back to a clean slate (single-user home-lab app).
export function devRouter(db: DB): Router {
  const r = Router();
  r.post('/reset', (_req, res) => {
    resetData(db);
    res.json({ ok: true });
  });
  return r;
}
