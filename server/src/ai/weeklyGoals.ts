// weeklyGoals.ts — a weekly checklist on the meal-plan screen. Marmalade suggests a few, she adds
// her own, and the ones we can measure tick themselves from her data. Stored as a settings blob
// keyed to the week (Sunday start); a new week starts fresh.

import { randomUUID } from 'node:crypto';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { runTask } from './task';
import { WeeklyGoalSuggestionsSchema } from './schemas';
import { addDaysStr, nowIso, todayStr } from '../util';

export type AutoKind = 'log_daily' | 'under_goal' | 'walks' | 'weigh_in' | null;
export interface WeeklyGoal {
  id: string;
  text: string;
  source: 'ai' | 'me';
  auto: AutoKind;
  target: number;
  done: boolean;
}
interface Blob {
  week_start: string;
  items: WeeklyGoal[];
}

function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return addDaysStr(date, -d.getDay()); // getDay(): 0 = Sunday
}
function read(db: DB): Blob | null {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = 'weekly_goals'").get() as { value_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as Blob;
  } catch {
    return null;
  }
}
function write(db: DB, blob: Blob): void {
  db.prepare("INSERT INTO settings (key,value_json,updated_at) VALUES ('weekly_goals',?,?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at").run(JSON.stringify(blob), nowIso());
}

// the week's days from Sunday up to (and including) today
function daysSoFar(ws: string, today: string): string[] {
  const out: string[] = [];
  for (let d = ws; d <= today; d = addDaysStr(d, 1)) out.push(d);
  return out;
}

function autoDone(db: DB, item: WeeklyGoal, ws: string, today: string): boolean {
  const days = daysSoFar(ws, today);
  if (item.auto === 'log_daily') {
    return days.every((d) => !!db.prepare('SELECT 1 FROM food_log WHERE day_date = ? LIMIT 1').get(d));
  }
  if (item.auto === 'under_goal') {
    const goal = getSettings(db).daily_calorie_goal;
    let n = 0;
    for (const d of days) {
      const k = (db.prepare('SELECT SUM(kcal) AS k FROM food_log WHERE day_date = ?').get(d) as { k: number | null }).k;
      if (k != null && k > 0 && k <= goal) n++;
    }
    return n >= Math.max(1, item.target);
  }
  if (item.auto === 'walks') {
    const n = (db.prepare('SELECT COUNT(*) AS n FROM walk_log WHERE walk_date BETWEEN ? AND ?').get(ws, today) as { n: number }).n;
    return n >= Math.max(1, item.target);
  }
  if (item.auto === 'weigh_in') {
    const n = (db.prepare('SELECT COUNT(*) AS n FROM weight_entries WHERE entry_date BETWEEN ? AND ?').get(ws, today) as { n: number }).n;
    return n >= Math.max(1, item.target);
  }
  return item.done;
}

function withAuto(db: DB, blob: Blob, today: string): WeeklyGoal[] {
  return blob.items.map((it) => (it.auto ? { ...it, done: autoDone(db, it, blob.week_start, today) } : it));
}

export function getWeeklyGoals(db: DB, date: string = todayStr()): WeeklyGoal[] {
  const ws = weekStart(date);
  let blob = read(db);
  if (!blob || blob.week_start !== ws) {
    blob = { week_start: ws, items: [] };
    write(db, blob);
  }
  return withAuto(db, blob, date);
}

export function saveWeeklyGoals(db: DB, date: string, items: WeeklyGoal[]): WeeklyGoal[] {
  const ws = weekStart(date);
  const clean = items
    .filter((i) => i && typeof i.text === 'string' && i.text.trim())
    .slice(0, 12)
    .map((i) => ({
      id: typeof i.id === 'string' && i.id ? i.id : randomUUID(),
      text: String(i.text).slice(0, 120),
      source: i.source === 'ai' ? 'ai' : ('me' as 'ai' | 'me'),
      auto: (['log_daily', 'under_goal', 'walks', 'weigh_in'] as const).includes(i.auto as never) ? i.auto : null,
      target: Number.isFinite(i.target) ? Number(i.target) : 0,
      done: !!i.done,
    }));
  write(db, { week_start: ws, items: clean });
  return withAuto(db, { week_start: ws, items: clean }, date);
}

export async function suggestWeeklyGoals(db: DB, date: string = todayStr()): Promise<WeeklyGoal[]> {
  const existing = getWeeklyGoals(db, date);
  const out = await runTask(
    db,
    {
      name: 'weekly-goals',
      schema: WeeklyGoalSuggestionsSchema,
      model: 'fast',
      globals: ['streaks', 'goals', 'recentDays'],
      system:
        'Suggest 3–4 small, encouraging weekly health goals for this person, grounded in her recent ' +
        'data and what would genuinely help next. Keep each short and warm. When a goal can be measured ' +
        'from logging, set "auto": "log_daily" (log something every day), "under_goal" (target = number ' +
        'of days under her calorie goal), "walks" (target = number of walks), or "weigh_in" (target 1). ' +
        'For anything subjective, use "none". Don\'t repeat goals she already has.',
    },
    { content: existing.length ? `She already has: ${existing.map((g) => g.text).join('; ')}. Suggest different ones.` : 'Suggest her first few weekly goals.', date },
  );
  if (!out) return existing;
  const have = new Set(existing.map((g) => g.text.toLowerCase()));
  const added: WeeklyGoal[] = out.goals
    .filter((g) => g.text.trim() && !have.has(g.text.trim().toLowerCase()))
    .map((g) => ({ id: randomUUID(), text: g.text.trim().slice(0, 120), source: 'ai' as const, auto: g.auto === 'none' ? null : g.auto, target: Math.round(g.target) || 1, done: false }));
  return saveWeeklyGoals(db, date, [...existing, ...added]);
}
