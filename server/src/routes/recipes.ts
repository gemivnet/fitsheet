import { join } from 'node:path';
import { Router } from 'express';
import { writeAudit } from '../audit';
import { uploadsDir, type DB } from '../db/index';
import { upload } from '../upload';
import { nowIso } from '../util';

function parseTags(v: unknown): string {
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'string' && v.trim()) {
    try {
      const a = JSON.parse(v);
      if (Array.isArray(a)) return JSON.stringify(a);
    } catch {
      return JSON.stringify(v.split(',').map((s) => s.trim()).filter(Boolean));
    }
  }
  return '[]';
}

export function recipesRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const where: string[] = [];
    const params: any[] = [];
    if (req.query.q) {
      where.push('name LIKE ?');
      params.push(`%${req.query.q}%`);
    }
    if (req.query.cook_band) {
      where.push('cook_band = ?');
      params.push(req.query.cook_band);
    }
    if (req.query.tag) {
      where.push("tags_json LIKE ?");
      params.push(`%"${req.query.tag}"%`);
    }
    const sql = 'SELECT * FROM recipes' + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ' ORDER BY is_favorite DESC, updated_at DESC';
    res.json(db.prepare(sql).all(...params));
  });

  r.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json(row);
  });

  r.post('/', upload.single('photo'), (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.name) return res.status(400).json({ error: 'name required' });
    const ts = nowIso();
    const info = db
      .prepare(
        'INSERT INTO recipes (name,approx_kcal,cook_band,photo,ingredients,steps,tags_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        b.name,
        b.approx_kcal ? Number(b.approx_kcal) : null,
        b.cook_band ?? null,
        req.file?.filename ?? null,
        b.ingredients ?? null,
        b.steps ?? null,
        parseTags(b.tags),
        ts,
        ts,
      );
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'recipe', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM recipes WHERE id = ?').get(id));
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, any>;
    db.prepare('UPDATE recipes SET name=?,approx_kcal=?,cook_band=?,ingredients=?,steps=?,tags_json=?,updated_at=? WHERE id=?').run(
      b.name ?? existing.name,
      b.approx_kcal != null ? Number(b.approx_kcal) : existing.approx_kcal,
      b.cook_band ?? existing.cook_band,
      b.ingredients ?? existing.ingredients,
      b.steps ?? existing.steps,
      b.tags != null ? parseTags(b.tags) : existing.tags_json,
      nowIso(),
      id,
    );
    writeAudit(db, { entity: 'recipe', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM recipes WHERE id = ?').get(id));
  });

  r.post('/:id/favorite', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT is_favorite FROM recipes WHERE id = ?').get(id) as { is_favorite: number } | undefined;
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare('UPDATE recipes SET is_favorite = ?, updated_at = ? WHERE id = ?').run(row.is_favorite ? 0 : 1, nowIso(), id);
    res.json(db.prepare('SELECT * FROM recipes WHERE id = ?').get(id));
  });

  r.get('/:id/file', (req, res) => {
    const row = db.prepare('SELECT photo FROM recipes WHERE id = ?').get(Number(req.params.id)) as { photo: string | null } | undefined;
    if (!row?.photo) return res.status(404).json({ error: 'not_found' });
    res.sendFile(join(uploadsDir(), row.photo));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
    writeAudit(db, { entity: 'recipe', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  return r;
}
