import { Router } from 'express';
import { buildAnalytics, detectMilestones, recomputeTrend } from '../analytics';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { getSettings, setSettings } from '../settings';
import { nowIso, todayStr } from '../util';

export function weightRouter(db: DB): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json(db.prepare('SELECT * FROM weight_entries ORDER BY entry_date ASC').all());
  });

  r.post('/', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const date = b.entry_date || todayStr();
    const weight = Number(b.weight_lb);
    if (!weight || weight <= 0) return res.status(400).json({ error: 'weight_lb required' });
    const ts = nowIso();
    db.prepare(
      'INSERT INTO weight_entries (entry_date,weight_lb,note,created_at,updated_at) VALUES (?,?,?,?,?) ' +
        'ON CONFLICT(entry_date) DO UPDATE SET weight_lb=excluded.weight_lb, note=excluded.note, updated_at=excluded.updated_at',
    ).run(date, weight, b.note ?? null, ts, ts);
    recomputeTrend(db);

    // First-ever weight seeds the goal start if unset.
    if (getSettings(db).weight_start_lb == null) {
      const first = db.prepare('SELECT weight_lb FROM weight_entries ORDER BY entry_date ASC LIMIT 1').get() as { weight_lb: number } | undefined;
      if (first) setSettings(db, { weight_start_lb: first.weight_lb });
    }

    const achieved = detectMilestones(db, getSettings(db));
    const row = db.prepare('SELECT * FROM weight_entries WHERE entry_date = ?').get(date) as { id: number };
    writeAudit(db, { entity: 'weight', entityId: row.id, action: 'create' });
    res.json({ entry: row, milestones: achieved });
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM weight_entries WHERE id = ?').run(id);
    recomputeTrend(db);
    writeAudit(db, { entity: 'weight', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  r.get('/goal', (_req, res) => {
    const s = getSettings(db);
    const a = buildAnalytics(db, s);
    res.json({ ...a.goal, current_trend: a.weight.current_trend, current_raw: a.weight.current_raw, units: s.units });
  });

  r.put('/goal', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const partial: Record<string, number | null> = {};
    if ('start_lb' in b) partial.weight_start_lb = b.start_lb == null ? null : Number(b.start_lb);
    if ('target_lb' in b) partial.weight_target_lb = b.target_lb == null ? null : Number(b.target_lb);
    setSettings(db, partial);
    const s = getSettings(db);
    const a = buildAnalytics(db, s);
    res.json({ ...a.goal, current_trend: a.weight.current_trend, current_raw: a.weight.current_raw, units: s.units });
  });

  r.get('/milestones', (req, res) => {
    const all = req.query.all === '1';
    const rows = all
      ? db.prepare('SELECT * FROM milestones ORDER BY threshold_lb ASC').all()
      : db.prepare('SELECT * FROM milestones WHERE acknowledged = 0 ORDER BY threshold_lb ASC').all();
    res.json(rows);
  });

  r.post('/milestones/:id/ack', (req, res) => {
    db.prepare('UPDATE milestones SET acknowledged = 1 WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  return r;
}
