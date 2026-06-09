import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { nowIso, todayStr } from '../util';

export function notesRouter(db: DB): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json(db.prepare('SELECT * FROM notes ORDER BY note_date DESC, id DESC LIMIT 200').all());
  });

  r.post('/', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.body) return res.status(400).json({ error: 'body required' });
    const ts = nowIso();
    const info = db
      .prepare('INSERT INTO notes (note_date,body,mood,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(b.note_date || todayStr(), b.body, b.mood ?? null, ts, ts);
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'note', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, any>;
    db.prepare('UPDATE notes SET body=?, mood=?, note_date=?, updated_at=? WHERE id=?').run(
      b.body ?? existing.body,
      b.mood ?? existing.mood,
      b.note_date ?? existing.note_date,
      nowIso(),
      id,
    );
    writeAudit(db, { entity: 'note', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    writeAudit(db, { entity: 'note', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  return r;
}
