import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { isDayStr, nowIso, todayStr } from '../util';

export function walksRouter(db: DB): Router {
  const r = Router();

  // ── presets ────────────────────────────────────────────────────────────
  r.get('/presets', (_req, res) => {
    res.json(db.prepare('SELECT * FROM walk_presets ORDER BY sort_order ASC, id ASC').all());
  });

  r.post('/presets', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    if (!b.label) return res.status(400).json({ error: 'label required' });
    const info = db
      .prepare('INSERT INTO walk_presets (label,default_minutes,default_distance,sort_order,created_at) VALUES (?,?,?,?,?)')
      .run(b.label, b.default_minutes ?? null, b.default_distance ?? null, b.sort_order ?? 0, nowIso());
    res.json(db.prepare('SELECT * FROM walk_presets WHERE id = ?').get(Number(info.lastInsertRowid)));
  });

  r.delete('/presets/:id', (req, res) => {
    db.prepare('DELETE FROM walk_presets WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ── log ────────────────────────────────────────────────────────────────
  r.get('/log', (req, res) => {
    const from = (req.query.from as string) || '0000-01-01';
    const to = (req.query.to as string) || '9999-12-31';
    res.json(db.prepare('SELECT * FROM walk_log WHERE walk_date BETWEEN ? AND ? ORDER BY walk_date DESC, id DESC').all(from, to));
  });

  // one-tap: log a preset for today
  r.post('/log/quick', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const preset = db.prepare('SELECT * FROM walk_presets WHERE id = ?').get(Number(b.preset_id)) as
      | { id: number; label: string; default_minutes: number | null; default_distance: number | null }
      | undefined;
    if (!preset) return res.status(404).json({ error: 'preset_not_found' });
    const info = db
      .prepare('INSERT INTO walk_log (walk_date,preset_id,label,minutes,distance,notes,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(isDayStr(b.walk_date) ? b.walk_date : todayStr(), preset.id, preset.label, preset.default_minutes, preset.default_distance, null, nowIso());
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'walk', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM walk_log WHERE id = ?').get(id));
  });

  // manual entry
  r.post('/log', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const info = db
      .prepare('INSERT INTO walk_log (walk_date,preset_id,label,minutes,distance,notes,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(isDayStr(b.walk_date) ? b.walk_date : todayStr(), b.preset_id ?? null, b.label ?? 'Walk', b.minutes ?? null, b.distance ?? null, b.notes ?? null, nowIso());
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'walk', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM walk_log WHERE id = ?').get(id));
  });

  r.delete('/log/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM walk_log WHERE id = ?').run(id);
    writeAudit(db, { entity: 'walk', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  return r;
}
