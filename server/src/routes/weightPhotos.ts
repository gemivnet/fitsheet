import { join } from 'node:path';
import { Router } from 'express';
import { writeAudit } from '../audit';
import { uploadsDir, type DB } from '../db/index';
import { upload } from '../upload';
import { nowIso, todayStr } from '../util';

export function weightPhotosRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const from = (req.query.from as string) || '0000-01-01';
    const to = (req.query.to as string) || '9999-12-31';
    res.json(db.prepare('SELECT * FROM weight_photos WHERE taken_date BETWEEN ? AND ? ORDER BY taken_date DESC, id DESC').all(from, to));
  });

  r.post('/', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const b = (req.body ?? {}) as Record<string, any>;
    const info = db
      .prepare('INSERT INTO weight_photos (entry_id,taken_date,stored_filename,caption,created_at) VALUES (?,?,?,?,?)')
      .run(b.entry_id ? Number(b.entry_id) : null, b.taken_date || todayStr(), req.file.filename, b.caption ?? null, nowIso());
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'weight_photo', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM weight_photos WHERE id = ?').get(id));
  });

  r.get('/:id/file', (req, res) => {
    const row = db.prepare('SELECT stored_filename FROM weight_photos WHERE id = ?').get(Number(req.params.id)) as
      | { stored_filename: string }
      | undefined;
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.sendFile(join(uploadsDir(), row.stored_filename));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM weight_photos WHERE id = ?').run(id);
    writeAudit(db, { entity: 'weight_photo', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  return r;
}
