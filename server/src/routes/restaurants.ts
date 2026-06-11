// restaurants.ts — the editable per-restaurant component menu (build-your-own parts). The AI seeds
// it; she can tweak values or add her own. Orders are assembled from these with a portion level.

import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { nowIso } from '../util';

const FIELDS = ['restaurant', 'name', 'category', 'grams', 'kcal', 'protein_g', 'carb_g', 'fat_g', 'default_on', 'sort_order'] as const;

export function restaurantsRouter(db: DB): Router {
  const r = Router();

  r.get('/components', (req, res) => {
    const restaurant = String(req.query.restaurant ?? '').trim();
    if (!restaurant) return res.json([]);
    res.json(db.prepare('SELECT * FROM restaurant_components WHERE restaurant = ? ORDER BY sort_order, name').all(restaurant));
  });

  // create or (by restaurant+name) update a component
  r.post('/components', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.restaurant || !b.name) return res.status(400).json({ error: 'restaurant and name required' });
    const ts = nowIso();
    db.prepare(
      'INSERT INTO restaurant_components (restaurant,name,category,grams,kcal,protein_g,carb_g,fat_g,default_on,sort_order,created_at,updated_at) ' +
        'VALUES (@restaurant,@name,@category,@grams,@kcal,@protein_g,@carb_g,@fat_g,@default_on,@sort_order,@created_at,@updated_at) ' +
        'ON CONFLICT(restaurant,name) DO UPDATE SET category=excluded.category,grams=excluded.grams,kcal=excluded.kcal,' +
        'protein_g=excluded.protein_g,carb_g=excluded.carb_g,fat_g=excluded.fat_g,default_on=excluded.default_on,updated_at=excluded.updated_at',
    ).run({
      restaurant: String(b.restaurant).trim(),
      name: String(b.name).trim(),
      category: b.category ?? 'other',
      grams: Number(b.grams) || 0,
      kcal: Number(b.kcal) || 0,
      protein_g: Number(b.protein_g) || 0,
      carb_g: Number(b.carb_g) || 0,
      fat_g: Number(b.fat_g) || 0,
      default_on: b.default_on ? 1 : 0,
      sort_order: Number(b.sort_order) || 0,
      created_at: ts,
      updated_at: ts,
    });
    const row = db.prepare('SELECT * FROM restaurant_components WHERE restaurant = ? AND name = ?').get(String(b.restaurant).trim(), String(b.name).trim());
    writeAudit(db, { entity: 'restaurant_component', entityId: Number((row as any)?.id ?? 0), action: 'create' });
    res.json(row);
  });

  r.patch('/components/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM restaurant_components WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, any>;
    const next: Record<string, any> = { ...existing };
    for (const k of FIELDS) if (k in b) next[k] = k === 'default_on' ? (b[k] ? 1 : 0) : b[k];
    next.updated_at = nowIso();
    db.prepare(
      'UPDATE restaurant_components SET restaurant=@restaurant,name=@name,category=@category,grams=@grams,kcal=@kcal,' +
        'protein_g=@protein_g,carb_g=@carb_g,fat_g=@fat_g,default_on=@default_on,sort_order=@sort_order,updated_at=@updated_at WHERE id=@id',
    ).run({ ...next, id });
    writeAudit(db, { entity: 'restaurant_component', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM restaurant_components WHERE id = ?').get(id));
  });

  r.delete('/components/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM restaurant_components WHERE id = ?').run(id);
    writeAudit(db, { entity: 'restaurant_component', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  return r;
}
