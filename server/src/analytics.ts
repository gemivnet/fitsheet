// analytics.ts — the "nerdy tab" engine + milestone detection.
// EWMA trend smoothing, empirical TDEE (intake vs trend slope), goal ETA, projection, adherence.
// All weights in lb. Energy balance constant: 3500 kcal ≈ 1 lb.

import type { DB } from './db/index';
import type { Settings } from './settings';
import { nowIso, round, todayStr } from './util';

const KCAL_PER_LB = 3500;
const ALPHA = 0.1;

// ── date helpers (YYYY-MM-DD) ───────────────────────────────────────────────
const parse = (s: string): Date => new Date(`${s}T00:00:00`);
const diffDays = (a: string, b: string): number => Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);
function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
function lastNDates(end: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(end, -i));
  return out;
}

interface WeightRow {
  entry_date: string;
  weight_lb: number;
  trend_lb: number | null;
}

/** Recompute EWMA trend for every weight entry; persist trend_lb. Call after any weight write. */
export function recomputeTrend(db: DB): void {
  const rows = db.prepare('SELECT id, entry_date, weight_lb FROM weight_entries ORDER BY entry_date ASC').all() as {
    id: number;
    entry_date: string;
    weight_lb: number;
  }[];
  const upd = db.prepare('UPDATE weight_entries SET trend_lb = ? WHERE id = ?');
  let trend = 0;
  db.transaction(() => {
    rows.forEach((r, i) => {
      trend = i === 0 ? r.weight_lb : trend + ALPHA * (r.weight_lb - trend);
      upd.run(round(trend, 2), r.id);
    });
  })();
}

/** Distinct-day total kcal from the food log. */
function intakeByDay(db: DB): Map<string, number> {
  const rows = db.prepare('SELECT day_date, SUM(kcal) AS kcal FROM food_log GROUP BY day_date').all() as {
    day_date: string;
    kcal: number;
  }[];
  return new Map(rows.map((r) => [r.day_date, r.kcal]));
}

/**
 * Detect newly-crossed weight-loss milestones (every milestone_step_lb below the start weight,
 * measured on the smoothed trend). Inserts rows; returns the ones achieved on this call.
 */
export function detectMilestones(db: DB, settings: Settings): { threshold_lb: number }[] {
  const series = db.prepare('SELECT entry_date, weight_lb, trend_lb FROM weight_entries ORDER BY entry_date ASC').all() as WeightRow[];
  if (series.length === 0) return [];
  const start = settings.weight_start_lb ?? series[0].weight_lb;
  const current = series[series.length - 1].trend_lb ?? series[series.length - 1].weight_lb;
  const lost = start - current;
  const step = settings.milestone_step_lb || 5;
  if (lost < step) return [];

  const existing = new Set(
    (db.prepare("SELECT threshold_lb FROM milestones WHERE kind = 'weight_loss'").all() as { threshold_lb: number }[]).map(
      (r) => r.threshold_lb,
    ),
  );
  const achieved: { threshold_lb: number }[] = [];
  const ins = db.prepare(
    "INSERT OR IGNORE INTO milestones (kind, threshold_lb, achieved_date, acknowledged, created_at) VALUES ('weight_loss', ?, ?, 0, ?)",
  );
  for (let t = step; t <= lost + 1e-9; t += step) {
    if (existing.has(t)) continue;
    ins.run(t, todayStr(), nowIso());
    achieved.push({ threshold_lb: t });
  }
  return achieved;
}

export interface AnalyticsSummary {
  window_days: number;
  series: { date: string; raw: number; trend: number }[];
  weight: { current_raw: number | null; current_trend: number | null; lbs_per_week: number | null; label: string };
  tdee: { estimate: number | null; avg_intake: number | null; logged_days_in_window: number; reason: string | null };
  goal: {
    start: number | null;
    target: number | null;
    lost: number | null;
    remaining: number | null;
    pct: number | null;
    eta_weeks: number | null;
    eta_date: string | null;
  };
  projection: { date: string; weight: number }[];
  adherence: {
    days_logged: number;
    avg_intake: number | null;
    avg_intake_vs_goal: number | null;
    cumulative_deficit: number;
    logging_streak: number;
    under_goal_streak: number;
  };
}

export function buildAnalytics(db: DB, settings: Settings): AnalyticsSummary {
  const windowDays = settings.tdee_window_days || 21;
  const rows = db.prepare('SELECT entry_date, weight_lb, trend_lb FROM weight_entries ORDER BY entry_date ASC').all() as WeightRow[];
  const series = rows.map((r) => ({ date: r.entry_date, raw: r.weight_lb, trend: r.trend_lb ?? r.weight_lb }));
  const intake = intakeByDay(db);
  const today = todayStr();

  // ── weight trend & rate over the trailing window ──────────────────────────
  let trendSlope: number | null = null; // lb/day
  let lbsPerWeek: number | null = null;
  const current = series.length ? series[series.length - 1] : null;
  if (series.length >= 2) {
    const cutoff = addDays(current!.date, -windowDays);
    const win = series.filter((s) => s.date >= cutoff);
    if (win.length >= 2) {
      const a = win[0];
      const b = win[win.length - 1];
      const span = diffDays(b.date, a.date);
      if (span > 0) {
        trendSlope = (b.trend - a.trend) / span;
        lbsPerWeek = round(trendSlope * 7, 2);
      }
    }
  }
  const label = lbsPerWeek == null ? 'holding' : lbsPerWeek < -0.05 ? 'losing' : lbsPerWeek > 0.05 ? 'gaining' : 'holding';

  // ── empirical TDEE ────────────────────────────────────────────────────────
  const winDates = lastNDates(today, windowDays);
  const loggedInWin = winDates.filter((d) => intake.has(d));
  const avgIntakeWin = loggedInWin.length ? round(loggedInWin.reduce((s, d) => s + (intake.get(d) ?? 0), 0) / loggedInWin.length) : null;
  let tdee: number | null = null;
  let tdeeReason: string | null = 'needs_more_data';
  if (loggedInWin.length >= 14 && trendSlope != null && avgIntakeWin != null) {
    tdee = Math.round(avgIntakeWin - trendSlope * KCAL_PER_LB);
    tdeeReason = null;
  }

  // ── goal ──────────────────────────────────────────────────────────────────
  const start = settings.weight_start_lb ?? (series.length ? series[0].raw : null);
  const target = settings.weight_target_lb;
  const curTrend = current ? current.trend : null;
  let lost: number | null = null;
  let remaining: number | null = null;
  let pct: number | null = null;
  let etaWeeks: number | null = null;
  let etaDate: string | null = null;
  if (start != null && curTrend != null) lost = round(start - curTrend, 1);
  if (target != null && curTrend != null) remaining = round(curTrend - target, 1);
  if (start != null && target != null && curTrend != null && start !== target) {
    pct = Math.max(0, Math.min(100, Math.round(((start - curTrend) / (start - target)) * 100)));
  }
  if (remaining != null && lbsPerWeek != null && lbsPerWeek < 0) {
    etaWeeks = round(remaining / -lbsPerWeek, 1);
    etaDate = addDays(today, Math.round(etaWeeks * 7));
  }

  // ── projection from her calorie goal ──────────────────────────────────────
  const projection: { date: string; weight: number }[] = [];
  if (tdee != null && curTrend != null) {
    const dailyLb = (tdee - settings.daily_calorie_goal) / KCAL_PER_LB; // positive = losing
    for (let d = 0; d <= 180; d += 15) {
      let w = curTrend - dailyLb * d;
      if (target != null && dailyLb > 0) w = Math.max(target, w);
      projection.push({ date: addDays(today, d), weight: round(w, 1) });
    }
  }

  // ── adherence ───────────────────────────────────────────────────────────
  const allLogged = [...intake.keys()];
  const daysLogged = allLogged.length;
  const avgIntakeAll = daysLogged ? round([...intake.values()].reduce((s, v) => s + v, 0) / daysLogged) : null;
  const goal = settings.daily_calorie_goal;
  const cumulativeDeficit = Math.round([...intake.values()].reduce((s, v) => s + (goal - v), 0));
  let loggingStreak = 0;
  for (let i = 0; ; i++) {
    if (intake.has(addDays(today, -i))) loggingStreak++;
    else break;
  }
  let underGoalStreak = 0;
  for (let i = 0; ; i++) {
    const d = addDays(today, -i);
    if (intake.has(d) && (intake.get(d) ?? 0) <= goal) underGoalStreak++;
    else break;
  }

  return {
    window_days: windowDays,
    series,
    weight: {
      current_raw: current ? round(current.raw, 1) : null,
      current_trend: curTrend != null ? round(curTrend, 1) : null,
      lbs_per_week: lbsPerWeek,
      label,
    },
    tdee: { estimate: tdee, avg_intake: avgIntakeWin, logged_days_in_window: loggedInWin.length, reason: tdeeReason },
    goal: { start, target, lost, remaining, pct, eta_weeks: etaWeeks, eta_date: etaDate },
    projection,
    adherence: {
      days_logged: daysLogged,
      avg_intake: avgIntakeAll,
      avg_intake_vs_goal: avgIntakeAll != null ? Math.round(avgIntakeAll - goal) : null,
      cumulative_deficit: cumulativeDeficit,
      logging_streak: loggingStreak,
      under_goal_streak: underGoalStreak,
    },
  };
}
