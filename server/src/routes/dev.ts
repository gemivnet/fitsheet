import { Router } from 'express';
import type { DB } from '../db/index';
import { resetData } from '../seed';

// Utility endpoint: wipe all data back to a clean slate (single-user home-lab app).
// Requires an explicit confirmation token so a stray request can't erase everything.
export function devRouter(db: DB): Router {
  const r = Router();
  r.post('/reset', (req, res) => {
    if ((req.body ?? {}).confirm !== 'ERASE') return res.status(400).json({ error: 'confirmation_required' });
    resetData(db);
    res.json({ ok: true });
  });
  return r;
}
