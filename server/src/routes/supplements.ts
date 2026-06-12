// supplements.ts — vitamins & medications (managed in Settings) + a per-day "taken" check.

import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { nowIso, todayStr } from '../util';

export function supplementsRouter(db: DB): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json(db.prepare('SELECT * FROM supplements WHERE active = 1 ORDER BY sort_order, id').all());
  });

  // today's checklist with a taken flag
  r.get('/today', (req, res) => {
    const date = (req.query.date as string) || todayStr();
    res.json(
      db
        .prepare(
          'SELECT s.id, s.name, CASE WHEN l.day_date IS NOT NULL THEN 1 ELSE 0 END AS taken ' +
            'FROM supplements s LEFT JOIN supplement_log l ON l.supplement_id = s.id AND l.day_date = ? ' +
            'WHERE s.active = 1 ORDER BY s.sort_order, s.id',
        )
        .all(date),
    );
  });

  r.post('/', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    const ts = nowIso();
    const max = (db.prepare('SELECT MAX(sort_order) AS m FROM supplements').get() as { m: number | null }).m ?? 0;
    const info = db.prepare('INSERT INTO supplements (name, sort_order, active, created_at, updated_at) VALUES (?,?,1,?,?)').run(name, max + 1, ts, ts);
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'supplement', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM supplements WHERE id = ?').get(id));
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const ex = db.prepare('SELECT * FROM supplements WHERE id = ?').get(id) as { name: string; active: number } | undefined;
    if (!ex) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = b.name != null ? String(b.name).trim() : ex.name;
    const active = b.active != null ? (b.active ? 1 : 0) : ex.active;
    db.prepare('UPDATE supplements SET name=?, active=?, updated_at=? WHERE id=?').run(name, active, nowIso(), id);
    writeAudit(db, { entity: 'supplement', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM supplements WHERE id = ?').get(id));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM supplement_log WHERE supplement_id = ?').run(id);
    db.prepare('DELETE FROM supplements WHERE id = ?').run(id);
    writeAudit(db, { entity: 'supplement', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  // tick / untick for a day
  r.post('/:id/toggle', (req, res) => {
    const id = Number(req.params.id);
    const date = String(req.body?.date ?? todayStr());
    const taken = req.body?.taken !== false;
    if (taken) db.prepare('INSERT OR IGNORE INTO supplement_log (supplement_id, day_date, created_at) VALUES (?,?,?)').run(id, date, nowIso());
    else db.prepare('DELETE FROM supplement_log WHERE supplement_id = ? AND day_date = ?').run(id, date);
    res.json({ ok: true });
  });

  return r;
}
