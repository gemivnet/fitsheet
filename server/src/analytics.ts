// analytics.ts — the "nerdy tab" engine + milestone detection.
// Time-weighted regression trend (handles weekly, irregular weigh-ins without months of lag),
// empirical TDEE with an honest ± range, goal ETA with confidence, adaptive projection.
// All weights in lb. Energy balance constant: 3500 kcal ≈ 1 lb.

import type { DB } from './db/index';
import type { Settings } from './settings';
import { nowIso, round, todayStr } from './util';

const KCAL_PER_LB = 3500;
const TREND_TAU_DAYS = 30; // how fast old weigh-ins fade out of the trend

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

export interface TrendFit {
  value: number; // fitted weight at `at`
  slope: number; // lb per day
  sigmaSlope: number; // standard error of the slope (lb/day); 0 when n < 3 (fit is exact)
  sigmaResid: number; // residual std dev (lb); 0 when n < 3
  n: number;
}

/**
 * Time-weighted least-squares line through weigh-ins: w_i = exp(-(at - t_i)/tau).
 * Stable from 2-3 points and reacts within days (per-entry EWMA needed ~10 entries —
 * months at weekly weigh-in cadence). t and at are in days; null when n < 2 or all
 * points share one day.
 */
export function fitWeightedTrend(points: { t: number; y: number }[], at: number, tau: number = TREND_TAU_DAYS): TrendFit | null {
  const n = points.length;
  if (n < 2) return null;
  let W = 0;
  let tBar = 0;
  let yBar = 0;
  const w = points.map((p) => Math.exp(-Math.abs(at - p.t) / tau));
  for (let i = 0; i < n; i++) {
    W += w[i];
    tBar += w[i] * points[i].t;
    yBar += w[i] * points[i].y;
  }
  tBar /= W;
  yBar /= W;
  let Sxx = 0;
  let Sxy = 0;
  for (let i = 0; i < n; i++) {
    Sxx += w[i] * (points[i].t - tBar) * (points[i].t - tBar);
    Sxy += w[i] * (points[i].t - tBar) * (points[i].y - yBar);
  }
  if (Sxx < 1e-9) return null;
  const slope = Sxy / Sxx;
  const intercept = yBar - slope * tBar;
  let s2 = 0;
  if (n > 2) {
    let wr2 = 0;
    for (let i = 0; i < n; i++) {
      const r = points[i].y - (intercept + slope * points[i].t);
      wr2 += w[i] * r * r;
    }
    s2 = wr2 / (W * (1 - 2 / n));
  }
  return { value: intercept + slope * at, slope, sigmaSlope: Math.sqrt(s2 / Sxx), sigmaResid: Math.sqrt(s2), n };
}

const dayNum = (s: string): number => parse(s).getTime() / 86_400_000;

/**
 * Recompute the trend for every weight entry; persist trend_lb. Call after any weight write.
 * Causal: each entry's trend is fit only on entries up to that date (anchored there), so the
 * historical curve keeps its shape and detectMilestones/charts read it unchanged.
 */
export function recomputeTrend(db: DB): void {
  const rows = db.prepare('SELECT id, entry_date, weight_lb FROM weight_entries ORDER BY entry_date ASC').all() as {
    id: number;
    entry_date: string;
    weight_lb: number;
  }[];
  const pts = rows.map((r) => ({ t: dayNum(r.entry_date), y: r.weight_lb }));
  const upd = db.prepare('UPDATE weight_entries SET trend_lb = ? WHERE id = ?');
  db.transaction(() => {
    rows.forEach((r, i) => {
      const fit = fitWeightedTrend(pts.slice(0, i + 1), pts[i].t);
      upd.run(round(fit ? fit.value : r.weight_lb, 2), r.id);
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
  weight: { current_raw: number | null; current_trend: number | null; lbs_per_week: number | null; lbs_per_week_sigma: number | null; label: string };
  tdee: {
    estimate: number | null;
    low: number | null;
    high: number | null;
    avg_intake: number | null;
    logged_days_in_window: number;
    weighins_in_window: number;
    reason: string | null;
  };
  goal: {
    start: number | null;
    target: number | null;
    lost: number | null;
    remaining: number | null;
    pct: number | null;
    eta_weeks: number | null;
    eta_weeks_low: number | null;
    eta_weeks_high: number | null;
    eta_confidence: 'low' | 'medium' | 'high' | null;
    eta_date: string | null;
  };
  projection: { date: string; weight: number; low: number; high: number }[];
  /** Cold-start helper: what's still needed before the maintenance estimate appears. */
  progress: { weighins_needed: number; logged_days_needed: number } | null;
  adherence: {
    days_logged: number;
    avg_intake: number | null;
    avg_intake_vs_goal: number | null;
    cumulative_deficit: number;
    logging_streak: number;
    under_goal_streak: number;
  };
}

export function buildAnalytics(db: DB, settings: Settings, today: string = todayStr()): AnalyticsSummary {
  const windowDays = settings.tdee_window_days || 21;
  const rows = db.prepare('SELECT entry_date, weight_lb, trend_lb FROM weight_entries ORDER BY entry_date ASC').all() as WeightRow[];
  const series = rows.map((r) => ({ date: r.entry_date, raw: r.weight_lb, trend: r.trend_lb ?? r.weight_lb }));
  const intake = intakeByDay(db);

  // ── weight trend & rate: one windowed regression on RAW weigh-ins ─────────
  // (the regression IS the smoother — fitting trend-of-trend would double-smooth)
  let trendSlope: number | null = null; // lb/day
  let lbsPerWeek: number | null = null;
  let lbsPerWeekSigma: number | null = null;
  let rateFit: TrendFit | null = null;
  const current = series.length ? series[series.length - 1] : null;
  if (series.length >= 2) {
    const cutoff = addDays(current!.date, -windowDays);
    const win = rows.filter((r) => r.entry_date >= cutoff);
    if (win.length >= 3) {
      rateFit = fitWeightedTrend(
        win.map((r) => ({ t: dayNum(r.entry_date), y: r.weight_lb })),
        dayNum(current!.date),
      );
      if (rateFit) {
        trendSlope = rateFit.slope;
        lbsPerWeek = round(rateFit.slope * 7, 2);
        lbsPerWeekSigma = round(rateFit.sigmaSlope * 7, 2);
      }
    }
  }
  const weighinsInWin = current ? rows.filter((r) => r.entry_date >= addDays(current.date, -windowDays)).length : 0;
  const label = lbsPerWeek == null ? 'holding' : lbsPerWeek < -0.05 ? 'losing' : lbsPerWeek > 0.05 ? 'gaining' : 'holding';

  // ── empirical TDEE with an honest ± range ────────────────────────────────
  const winDates = lastNDates(today, windowDays);
  const loggedInWin = winDates.filter((d) => intake.has(d));
  const avgIntakeWin = loggedInWin.length ? round(loggedInWin.reduce((s, d) => s + (intake.get(d) ?? 0), 0) / loggedInWin.length) : null;
  let tdee: number | null = null;
  let tdeeLow: number | null = null;
  let tdeeHigh: number | null = null;
  let tdeeReason: string | null = 'needs_more_data';
  if (loggedInWin.length >= 14 && weighinsInWin >= 4 && trendSlope != null && avgIntakeWin != null && rateFit) {
    tdee = Math.round(avgIntakeWin - trendSlope * KCAL_PER_LB);
    // uncertainty: slope error (dominates with sparse weigh-ins) + intake sampling error
    const vals = loggedInWin.map((d) => intake.get(d) ?? 0);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const sdIntake = vals.length > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (vals.length - 1)) : 0;
    const sigmaTdee = Math.sqrt((rateFit.sigmaSlope * KCAL_PER_LB) ** 2 + (sdIntake / Math.sqrt(vals.length)) ** 2);
    tdeeLow = Math.round(tdee - sigmaTdee);
    tdeeHigh = Math.round(tdee + sigmaTdee);
    tdeeReason = sigmaTdee > 400 ? 'high_variance' : null;
  } else if (loggedInWin.length >= 14 && weighinsInWin < 4) {
    tdeeReason = 'needs_more_weighins';
  }
  const progress = tdee == null ? { weighins_needed: Math.max(0, 4 - weighinsInWin), logged_days_needed: Math.max(0, 14 - loggedInWin.length) } : null;

  // ── goal ──────────────────────────────────────────────────────────────────
  const start = settings.weight_start_lb ?? (series.length ? series[0].raw : null);
  const target = settings.weight_target_lb;
  const curTrend = current ? current.trend : null;
  let lost: number | null = null;
  let remaining: number | null = null;
  let pct: number | null = null;
  let etaWeeks: number | null = null;
  let etaDate: string | null = null;
  let etaWeeksLow: number | null = null;
  let etaWeeksHigh: number | null = null;
  let etaConfidence: 'low' | 'medium' | 'high' | null = null;
  if (start != null && curTrend != null) lost = round(start - curTrend, 1);
  if (target != null && curTrend != null) remaining = round(curTrend - target, 1);
  if (start != null && target != null && curTrend != null && start !== target) {
    pct = Math.max(0, Math.min(100, Math.round(((start - curTrend) / (start - target)) * 100)));
  }
  if (remaining != null && lbsPerWeek != null && lbsPerWeek < 0) {
    etaWeeks = round(remaining / -lbsPerWeek, 1);
    etaDate = addDays(today, Math.round(etaWeeks * 7));
    if (lbsPerWeekSigma != null && rateFit) {
      const fast = lbsPerWeek - lbsPerWeekSigma; // more negative → sooner
      const slow = lbsPerWeek + lbsPerWeekSigma; // less negative → later (or never)
      etaWeeksLow = fast < 0 ? round(remaining / -fast, 1) : null;
      etaWeeksHigh = slow < 0 ? round(remaining / -slow, 1) : null;
      etaConfidence =
        rateFit.n >= 8 && lbsPerWeekSigma < 0.35 * Math.abs(lbsPerWeek)
          ? 'high'
          : rateFit.n < 5 || lbsPerWeekSigma > 0.7 * Math.abs(lbsPerWeek)
            ? 'low'
            : 'medium';
    }
  }

  // ── projection from her calorie goal ──────────────────────────────────────
  // Pace decays toward HALF the current rate (tau 90d) — bodies adapt, but a straight
  // decay-to-zero would contradict the ETA card. Band = pace ± the slope's std error.
  const projection: { date: string; weight: number; low: number; high: number }[] = [];
  if (tdee != null && curTrend != null) {
    const dailyLb = (tdee - settings.daily_calorie_goal) / KCAL_PER_LB; // positive = losing
    const sigmaDaily = lbsPerWeekSigma != null ? lbsPerWeekSigma / 7 : 0;
    const lossAt = (rate: number, d: number) => rate * (0.5 * d + 45 * (1 - Math.exp(-d / 90)));
    const clampW = (w: number) => (target != null && dailyLb > 0 ? Math.max(target, w) : w);
    for (let d = 0; d <= 180; d += 15) {
      projection.push({
        date: addDays(today, d),
        weight: round(clampW(curTrend - lossAt(dailyLb, d)), 1),
        low: round(clampW(curTrend - lossAt(dailyLb + sigmaDaily, d)), 1),
        high: round(clampW(curTrend - lossAt(dailyLb - sigmaDaily, d)), 1),
      });
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
      lbs_per_week_sigma: lbsPerWeekSigma,
      label,
    },
    tdee: {
      estimate: tdee,
      low: tdeeLow,
      high: tdeeHigh,
      avg_intake: avgIntakeWin,
      logged_days_in_window: loggedInWin.length,
      weighins_in_window: weighinsInWin,
      reason: tdeeReason,
    },
    goal: {
      start,
      target,
      lost,
      remaining,
      pct,
      eta_weeks: etaWeeks,
      eta_weeks_low: etaWeeksLow,
      eta_weeks_high: etaWeeksHigh,
      eta_confidence: etaConfidence,
      eta_date: etaDate,
    },
    projection,
    progress,
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
