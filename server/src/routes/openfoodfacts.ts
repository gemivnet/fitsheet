import { Router } from 'express';
import { offBarcode, offSearch } from '../off';

export function offRouter(): Router {
  const r = Router();

  r.get('/barcode/:code', async (req, res) => {
    const f = await offBarcode(req.params.code);
    if (!f) return res.status(404).json({ error: 'not_found' });
    res.json(f);
  });

  r.get('/search', async (req, res) => {
    const q = ((req.query.q as string) || '').trim();
    if (!q) return res.json([]);
    res.json(await offSearch(q));
  });

  return r;
}
