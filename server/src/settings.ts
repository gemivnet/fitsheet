// settings.ts — typed key/value settings with defaults. The app's goals, units & reminder
// schedule live here. Calorie goal is MANUAL (never auto-computed), per the product decision.

import type { DB } from './db/index';
import { nowIso } from './util';

export interface Settings {
  display_name: string;
  units: 'lb' | 'kg';
  daily_calorie_goal: number;
  protein_goal_g: number;
  carb_goal_g: number;
  fat_goal_g: number;
  weight_start_lb: number | null;
  weight_target_lb: number | null;
  weigh_in_weekday: number; // 0 = Sunday
  weigh_in_hour: number; // 0-23 local
  workout_reminders: boolean;
  milestone_step_lb: number;
  tdee_window_days: number;
  onboarded: boolean;
  // weekly calorie banking: roll prior over/under into today's target
  weekly_banking: boolean;
  // optional inputs for the calorie-goal calculator (Mifflin-St Jeor)
  sex: 'female' | 'male' | null;
  age: number | null;
  height_cm: number | null;
  activity_factor: number;
  goal_rate_lb: number; // target loss per week, in lb
}

export const DEFAULT_SETTINGS: Settings = {
  display_name: 'there',
  units: 'lb',
  daily_calorie_goal: 1850,
  protein_goal_g: 120,
  carb_goal_g: 205,
  fat_goal_g: 60,
  weight_start_lb: null,
  weight_target_lb: null,
  weigh_in_weekday: 0,
  weigh_in_hour: 9,
  workout_reminders: true,
  milestone_step_lb: 5,
  tdee_window_days: 21,
  onboarded: false,
  weekly_banking: true,
  sex: null,
  age: null,
  height_cm: null,
  activity_factor: 1.375,
  goal_rate_lb: 1.0,
};

export function getSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value_json FROM settings').all() as { key: string; value_json: string }[];
  const stored: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value_json);
    } catch {
      /* ignore corrupt row */
    }
  }
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}

export function setSettings(db: DB, partial: Partial<Settings>): Settings {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at',
  );
  const ts = nowIso();
  db.transaction(() => {
    for (const [k, v] of Object.entries(partial)) {
      if (v === undefined) continue;
      stmt.run(k, JSON.stringify(v), ts);
    }
  })();
  return getSettings(db);
}
