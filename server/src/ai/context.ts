// context.ts — assembles the "global context" an AI task asks for. A task declares which
// slices of her real history it needs (foods she eats, weight trend, streaks, goals, recent
// days) and this turns the toggled set into one compact prompt string. Single-user app, so
// leaning hard on real history is the whole point.

import type { DB } from '../db/index';
import { buildAnalytics } from '../analytics';
import { getSettings } from '../settings';
import { personalFoodsHint, personalSlotHint } from './personalContext';
import { addDaysStr, round, todayStr } from '../util';

export type ContextFlag = 'topFoods' | 'mealHabits' | 'weightTrend' | 'streaks' | 'goals' | 'recentDays';

/** Build the context block for the requested slices. `date` is the client's local day. */
export function assembleContext(db: DB, flags: ContextFlag[] = [], date: string = todayStr()): string {
  if (!flags.length) return '';
  const want = new Set(flags);
  const lines: string[] = [];
  const s = getSettings(db);

  if (want.has('goals')) {
    lines.push(`Daily calorie goal: ${s.daily_calorie_goal} kcal. Macro goals: protein ${s.protein_goal_g} g, carbs ${s.carb_goal_g} g, fat ${s.fat_goal_g} g.`);
  }

  if (want.has('topFoods')) {
    const foods = personalFoodsHint(db);
    if (foods) lines.push(`Foods she logs most (with usual portions): ${foods}.`);
  }

  if (want.has('mealHabits')) {
    const slots = personalSlotHint(db);
    if (slots) lines.push(`Her usual foods by meal: ${slots}.`);
  }

  if (want.has('weightTrend') || want.has('streaks')) {
    const a = buildAnalytics(db, s, date);
    if (want.has('weightTrend')) {
      const w = a.weight;
      if (w.current_trend != null) {
        const rate = w.lbs_per_week != null ? `, trending ${w.lbs_per_week > 0 ? '+' : ''}${w.lbs_per_week} lb/week (${w.label})` : '';
        const band = w.lbs_per_week_sigma ? ` (±${w.lbs_per_week_sigma} lb/week — so anything inside that is normal week-to-week noise, not real change)` : '';
        lines.push(`Smoothed weight trend: ${w.current_trend} lb${rate}${band}.`);
      }
      if (a.goal.eta_date) lines.push(`On pace to reach goal around ${a.goal.eta_date} (${a.goal.eta_confidence ?? 'rough'} confidence).`);
    }
    if (want.has('streaks')) {
      lines.push(`Logging streak: ${a.adherence.logging_streak} days. Under-goal streak: ${a.adherence.under_goal_streak} days. Days logged in total: ${a.adherence.days_logged}.`);
    }
  }

  if (want.has('recentDays')) lines.push(recentDays(db, date));

  return lines.filter(Boolean).join('\n');
}

// The last 7 days of intake vs goal + most recent weigh-ins — the raw material for spotting
// anything unusual. Kept compact (one line per day).
function recentDays(db: DB, date: string): string {
  const goal = getSettings(db).daily_calorie_goal;
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDaysStr(date, -i);
    const row = db.prepare('SELECT SUM(kcal) AS k, COUNT(*) AS n FROM food_log WHERE day_date = ?').get(d) as { k: number | null; n: number };
    const dow = new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
    if (row.k == null) days.push(`${d} (${dow}): not logged`);
    else days.push(`${d} (${dow}): ${Math.round(row.k)} kcal across ${row.n} items (${Math.round(row.k) <= goal ? 'under' : 'over'} goal)`);
  }
  const weighIns = db.prepare('SELECT entry_date, weight_lb, trend_lb FROM weight_entries ORDER BY entry_date DESC LIMIT 5').all() as { entry_date: string; weight_lb: number; trend_lb: number | null }[];
  const wLines = weighIns.map((w) => `${w.entry_date}: ${round(w.weight_lb, 1)} lb${w.trend_lb != null ? ` (trend ${round(w.trend_lb, 1)})` : ''}`);
  return `Last 7 days of intake:\n${days.join('\n')}\nRecent weigh-ins:\n${wLines.length ? wLines.join('\n') : 'none yet'}`;
}
