// cycle.ts — period predictions: average cycle length, next expected start, and the
// "concern date" (when a period counts as late). Mirrors the analytics.ts approach:
// nulls + a reason during cold start, point estimates + a confidence grade otherwise.
//
// Estimated entries (penciled in for an untracked month via "skip") anchor last_start so
// predictions roll forward, but are EXCLUDED from the averages — an estimate must never
// feed back into the numbers that produced it.

import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { DB } from './db/index';
import { addDaysStr, round } from './util';

const WINDOW = 12; // most recent gaps/durations considered
const MIN_GAPS = 2; // gaps needed before we predict (i.e. 3 logged starts)
const MIN_CONCERN_BUFFER_DAYS = 3; // even a perfectly regular cycle isn't "late" the next morning

export interface CycleEntryRow {
  id: number;
  start_date: string;
  end_date: string | null;
  estimated: number;
  notes: string | null;
}

export interface CycleSummary {
  n_cycles: number; // start→start gaps used for the averages
  avg_cycle_days: number | null;
  cycle_std_days: number | null;
  avg_duration_days: number | null;
  last_start: string | null;
  open_entry: { id: number; start_date: string } | null;
  predicted_start: string | null;
  concern_date: string | null; // predicted_start + max(3, 2σ) — derived, never stored
  is_late: boolean;
  confidence: 'low' | 'medium' | 'high' | null;
  reason: string | null; // 'need_more_cycles' during cold start
}

const diffDays = (a: string, b: string): number => differenceInCalendarDays(parseISO(b), parseISO(a));

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function sampleStd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function listCycleEntries(db: DB): CycleEntryRow[] {
  return db.prepare('SELECT * FROM cycle_entries ORDER BY start_date ASC').all() as CycleEntryRow[];
}

export function buildCycleSummary(db: DB, today: string): CycleSummary {
  const rows = listCycleEntries(db);
  const last = rows[rows.length - 1] ?? null;
  const open = rows.find((r) => r.end_date == null) ?? null;

  // Start→start gaps, most recent first, dropping any gap that touches an estimated entry.
  const gaps: number[] = [];
  for (let i = rows.length - 1; i > 0 && gaps.length < WINDOW; i--) {
    if (rows[i].estimated || rows[i - 1].estimated) continue;
    gaps.push(diffDays(rows[i - 1].start_date, rows[i].start_date));
  }
  const durations = rows
    .filter((r) => r.end_date != null && !r.estimated)
    .slice(-WINDOW)
    .map((r) => diffDays(r.start_date, r.end_date!) + 1);

  const base: CycleSummary = {
    n_cycles: gaps.length,
    avg_cycle_days: null,
    cycle_std_days: null,
    avg_duration_days: durations.length ? round(mean(durations)) : null,
    last_start: last?.start_date ?? null,
    open_entry: open ? { id: open.id, start_date: open.start_date } : null,
    predicted_start: null,
    concern_date: null,
    is_late: false,
    confidence: null,
    reason: null,
  };
  if (gaps.length < MIN_GAPS || !last) return { ...base, reason: 'need_more_cycles' };

  const avg = mean(gaps);
  const std = sampleStd(gaps);
  const predicted = addDaysStr(last.start_date, Math.round(avg));
  const concern = addDaysStr(predicted, Math.max(MIN_CONCERN_BUFFER_DAYS, Math.ceil(2 * std)));
  return {
    ...base,
    avg_cycle_days: round(avg),
    cycle_std_days: round(std),
    predicted_start: predicted,
    concern_date: concern,
    is_late: !open && diffDays(concern, today) > 0,
    confidence: gaps.length >= 6 ? 'high' : gaps.length >= 3 ? 'medium' : 'low',
  };
}

/** Which Home question is due today, if any. An open period always wins over "did it start?". */
export function cyclePrompt(s: CycleSummary, today: string): 'start' | 'end' | null {
  if (s.open_entry) {
    // Ask about finishing once we're near the usual duration (never on day one).
    const askFrom = Math.max(1, s.avg_duration_days != null ? Math.round(s.avg_duration_days) - 2 : 3);
    return diffDays(s.open_entry.start_date, today) >= askFrom ? 'end' : null;
  }
  if (s.predicted_start && diffDays(s.predicted_start, today) >= 0) return 'start';
  return null;
}
