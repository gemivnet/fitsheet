import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { nowIso } from '../util';

const ALLOWED = ['name', 'brand', 'barcode', 'source', 'off_id', 'serving_g', 'serving_label', 'kcal_100g', 'protein_100g', 'carb_100g', 'fat_100g', 'label_photo', 'is_favorite'] as const;

export function foodsRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    if (q) {
      res.json(db.prepare('SELECT * FROM foods WHERE name LIKE ? ORDER BY is_favorite DESC, updated_at DESC LIMIT 100').all(`%${q}%`));
    } else if (req.query.favorite === '1') {
      res.json(db.prepare('SELECT * FROM foods WHERE is_favorite = 1 ORDER BY updated_at DESC LIMIT 100').all());
    } else {
      res.json(db.prepare('SELECT * FROM foods ORDER BY is_favorite DESC, updated_at DESC LIMIT 100').all());
    }
  });

  r.get('/barcode/:code', (req, res) => {
    const row = db.prepare('SELECT * FROM foods WHERE barcode = ? ORDER BY updated_at DESC LIMIT 1').get(req.params.code);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json(row);
  });

  r.post('/', (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!b.name || b.kcal_100g == null) return res.status(400).json({ error: 'name and kcal_100g required' });
    const ts = nowIso();
    const info = db
      .prepare(
        'INSERT INTO foods (name,brand,barcode,source,off_id,serving_g,serving_label,kcal_100g,protein_100g,carb_100g,fat_100g,label_photo,is_favorite,created_at,updated_at) ' +
          'VALUES (@name,@brand,@barcode,@source,@off_id,@serving_g,@serving_label,@kcal_100g,@protein_100g,@carb_100g,@fat_100g,@label_photo,@is_favorite,@created_at,@updated_at)',
      )
      .run({
        name: b.name,
        brand: b.brand ?? null,
        barcode: b.barcode ?? null,
        source: b.source ?? 'custom',
        off_id: b.off_id ?? null,
        serving_g: b.serving_g ?? null,
        serving_label: b.serving_label ?? null,
        kcal_100g: b.kcal_100g ?? 0,
        protein_100g: b.protein_100g ?? 0,
        carb_100g: b.carb_100g ?? 0,
        fat_100g: b.fat_100g ?? 0,
        label_photo: b.label_photo ?? null,
        is_favorite: b.is_favorite ? 1 : 0,
        created_at: ts,
        updated_at: ts,
      });
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'food', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM foods WHERE id = ?').get(id));
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM foods WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...existing };
    for (const k of ALLOWED) if (k in b) next[k] = k === 'is_favorite' ? (b[k] ? 1 : 0) : b[k];
    next.updated_at = nowIso();
    db.prepare(
      'UPDATE foods SET name=@name,brand=@brand,barcode=@barcode,source=@source,off_id=@off_id,serving_g=@serving_g,serving_label=@serving_label,kcal_100g=@kcal_100g,protein_100g=@protein_100g,carb_100g=@carb_100g,fat_100g=@fat_100g,label_photo=@label_photo,is_favorite=@is_favorite,updated_at=@updated_at WHERE id=@id',
    ).run({ ...next, id });
    writeAudit(db, { entity: 'food', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM foods WHERE id = ?').get(id));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM foods WHERE id = ?').run(id);
    writeAudit(db, { entity: 'food', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  return r;
}
