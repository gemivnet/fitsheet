import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { nowIso, todayStr } from '../util';

export function workoutsRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const from = (req.query.from as string) || '0000-01-01';
    const to = (req.query.to as string) || '9999-12-31';
    res.json(
      db
        .prepare(
          'SELECT * FROM workouts WHERE (scheduled_date BETWEEN ? AND ?) OR (kind = \'adhoc\' AND completed_at IS NOT NULL) ' +
            'ORDER BY COALESCE(scheduled_date, substr(completed_at,1,10)) ASC, id ASC',
        )
        .all(from, to),
    );
  });

  r.get('/today', (_req, res) => {
    const today = todayStr();
    res.json(
      db
        .prepare('SELECT * FROM workouts WHERE scheduled_date IN (?, ?) ORDER BY scheduled_date ASC')
        .all(today, todayStr(new Date(Date.now() + 86_400_000))),
    );
  });

  r.post('/', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.title) return res.status(400).json({ error: 'title required' });
    const ts = nowIso();
    const kind = b.kind === 'adhoc' ? 'adhoc' : 'planned';
    const info = db
      .prepare(
        'INSERT INTO workouts (title,kind,scheduled_date,planned_minutes,external_url,notes,completed_at,completed_minutes,created_at,updated_at) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        b.title,
        kind,
        b.scheduled_date ?? null,
        b.planned_minutes ?? null,
        b.external_url ?? null,
        b.notes ?? null,
        kind === 'adhoc' ? (b.completed_at ?? nowIso()) : null,
        kind === 'adhoc' ? (b.completed_minutes ?? b.planned_minutes ?? null) : null,
        ts,
        ts,
      );
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'workout', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM workouts WHERE id = ?').get(id));
  });

  r.post('/:id/complete', (req, res) => {
    const id = Number(req.params.id);
    const b = (req.body ?? {}) as Record<string, any>;
    db.prepare('UPDATE workouts SET completed_at = ?, completed_minutes = ?, updated_at = ? WHERE id = ?').run(
      nowIso(),
      b.minutes ?? null,
      nowIso(),
      id,
    );
    writeAudit(db, { entity: 'workout', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM workouts WHERE id = ?').get(id));
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id) as Record<string, any> | undefined;
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, any>;
    const next = { ...existing };
    for (const k of ['title', 'scheduled_date', 'planned_minutes', 'external_url', 'notes']) if (k in b) next[k] = b[k];
    next.updated_at = nowIso();
    db.prepare('UPDATE workouts SET title=@title,scheduled_date=@scheduled_date,planned_minutes=@planned_minutes,external_url=@external_url,notes=@notes,updated_at=@updated_at WHERE id=@id').run({
      ...next,
      id,
    });
    writeAudit(db, { entity: 'workout', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM workouts WHERE id = ?').get(id));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM workouts WHERE id = ?').run(id);
    writeAudit(db, { entity: 'workout', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  return r;
}
