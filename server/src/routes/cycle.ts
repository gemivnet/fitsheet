// cycle.ts — period tracking: history CRUD, predictions summary, a one-time bulk import,
// and "skip" (pencil in an estimated period for a month that wasn't tracked).

import { Router } from 'express';
import { writeAudit } from '../audit';
import { buildCycleSummary, listCycleEntries, type CycleEntryRow } from '../cycle';
import type { DB } from '../db/index';
import { addDaysStr, isDayStr, nowIso, todayStr } from '../util';

/** Overlap/sanity check for one entry against the rest. Returns an error string or null.
 *  An open entry (no end yet) occupies from its start onward, so nothing may follow it. */
function validateEntry(db: DB, e: { start_date: string; end_date: string | null }, excludeId?: number): string | null {
  if (!isDayStr(e.start_date)) return 'start_date must be YYYY-MM-DD';
  if (e.end_date != null && !isDayStr(e.end_date)) return 'end_date must be YYYY-MM-DD or null';
  if (e.end_date != null && e.end_date < e.start_date) return 'end_date is before start_date';
  const others = (listCycleEntries(db) as CycleEntryRow[]).filter((r) => r.id !== excludeId);
  const open = others.find((r) => r.end_date == null);
  if (e.end_date == null && open) return 'a period is already in progress — close it first';
  if (open && e.start_date >= open.start_date) return 'a period is still in progress — give it an end date first';
  for (const r of others) {
    const rEnd = r.end_date ?? r.start_date;
    const eEnd = e.end_date ?? e.start_date;
    if (e.start_date <= rEnd && eEnd >= r.start_date) return `overlaps the period starting ${r.start_date}`;
  }
  return null;
}

export function cycleRouter(db: DB): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    res.json(db.prepare('SELECT * FROM cycle_entries ORDER BY start_date DESC').all());
  });

  r.get('/summary', (req, res) => {
    const today = isDayStr(req.query.date) ? req.query.date : todayStr();
    res.json(buildCycleSummary(db, today));
  });

  r.post('/', (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const entry = {
      start_date: b.start_date as string,
      end_date: (b.end_date ?? null) as string | null,
    };
    const err = validateEntry(db, entry);
    if (err) return res.status(400).json({ error: err });
    const ts = nowIso();
    const info = db
      .prepare('INSERT INTO cycle_entries (start_date, end_date, estimated, notes, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(entry.start_date, entry.end_date, b.estimated ? 1 : 0, b.notes != null ? String(b.notes) : null, ts, ts);
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'cycle', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM cycle_entries WHERE id = ?').get(id));
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const ex = db.prepare('SELECT * FROM cycle_entries WHERE id = ?').get(id) as CycleEntryRow | undefined;
    if (!ex) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const merged = {
      start_date: (b.start_date ?? ex.start_date) as string,
      // explicit null re-opens the period; absent field keeps the current end
      end_date: ('end_date' in b ? b.end_date : ex.end_date) as string | null,
    };
    const err = validateEntry(db, merged, id);
    if (err) return res.status(400).json({ error: err });
    const estimated = b.estimated != null ? (b.estimated ? 1 : 0) : ex.estimated;
    const notes = 'notes' in b ? (b.notes != null ? String(b.notes) : null) : ex.notes;
    db.prepare('UPDATE cycle_entries SET start_date=?, end_date=?, estimated=?, notes=?, updated_at=? WHERE id=?').run(
      merged.start_date,
      merged.end_date,
      estimated,
      notes,
      nowIso(),
      id,
    );
    writeAudit(db, { entity: 'cycle', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM cycle_entries WHERE id = ?').get(id));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM cycle_entries WHERE id = ?').run(id);
    writeAudit(db, { entity: 'cycle', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  // One-time bulk history import: {entries: [{start, end}]}. All-or-nothing validation;
  // rows whose start_date already exists are skipped, so re-running is harmless.
  r.post('/import', (req, res) => {
    const entries = (req.body as { entries?: unknown })?.entries;
    if (!Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: 'entries[] required' });
    const parsed: { start: string; end: string | null }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i] as Record<string, unknown>;
      if (!isDayStr(e?.start)) return res.status(400).json({ error: `entries[${i}]: start must be YYYY-MM-DD` });
      const end = e.end == null ? null : e.end;
      if (end != null && !isDayStr(end)) return res.status(400).json({ error: `entries[${i}]: end must be YYYY-MM-DD or null` });
      if (end != null && end < e.start) return res.status(400).json({ error: `entries[${i}]: end is before start` });
      parsed.push({ start: e.start, end: end as string | null });
    }
    const sorted = [...parsed].sort((a, b) => (a.start < b.start ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      if (sorted[i].start <= (prev.end ?? prev.start)) {
        return res.status(400).json({ error: `payload overlaps around ${sorted[i].start}` });
      }
    }
    const existing = new Set((listCycleEntries(db) as CycleEntryRow[]).map((r) => r.start_date));
    const ts = nowIso();
    const ins = db.prepare('INSERT INTO cycle_entries (start_date, end_date, estimated, created_at, updated_at) VALUES (?,?,0,?,?)');
    let imported = 0;
    db.transaction(() => {
      for (const e of sorted) {
        if (existing.has(e.start)) continue;
        ins.run(e.start, e.end, ts, ts);
        imported++;
      }
    })();
    writeAudit(db, { entity: 'cycle', entityId: 0, action: 'create', diff: { import: true, imported, skipped: sorted.length - imported } });
    res.json({ imported, skipped: sorted.length - imported, total: sorted.length });
  });

  // "I didn't track this one": pencil in an estimated period at the predicted start so
  // predictions can roll forward. Only valid once the predicted start is in the past.
  r.post('/skip', (req, res) => {
    const today = isDayStr(req.body?.date) ? req.body.date : todayStr();
    const s = buildCycleSummary(db, today);
    if (s.open_entry) return res.status(400).json({ error: 'a period is in progress' });
    if (!s.predicted_start) return res.status(400).json({ error: 'not enough history to estimate' });
    if (s.predicted_start >= today) return res.status(400).json({ error: 'nothing to skip yet' });
    const duration = Math.max(1, Math.round(s.avg_duration_days ?? 5));
    // keep the estimate fully in the past — it shouldn't look like a period in progress
    const yesterday = addDaysStr(today, -1);
    const end = [addDaysStr(s.predicted_start, duration - 1), yesterday].sort()[0];
    const ts = nowIso();
    const info = db
      .prepare('INSERT INTO cycle_entries (start_date, end_date, estimated, created_at, updated_at) VALUES (?,?,1,?,?)')
      .run(s.predicted_start, end, ts, ts);
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'cycle', entityId: id, action: 'create', diff: { estimated: true } });
    res.json(db.prepare('SELECT * FROM cycle_entries WHERE id = ?').get(id));
  });

  return r;
}
