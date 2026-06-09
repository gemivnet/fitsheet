import { Router } from 'express';
import type { DB } from '../db/index';
import { DEFAULT_SETTINGS, getSettings, setSettings, type Settings } from '../settings';
import { todayStr } from '../util';

export function settingsRouter(db: DB): Router {
  const r = Router();
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

  r.get('/', (_req, res) => res.json(getSettings(db)));

  r.put('/', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const partial: Partial<Settings> = {};
    for (const k of keys) if (k in body) (partial as Record<string, unknown>)[k] = body[k];
    res.json(setSettings(db, partial));
  });

  // The single payload the app turns into on-device local notifications.
  r.get('/reminders', (_req, res) => {
    const s = getSettings(db);
    const horizon = 21;
    const workouts = db
      .prepare(
        "SELECT id, title, scheduled_date, planned_minutes FROM workouts " +
          'WHERE completed_at IS NULL AND scheduled_date IS NOT NULL AND scheduled_date >= ? ORDER BY scheduled_date ASC LIMIT 40',
      )
      .all(todayStr());
    res.json({
      weigh_in_weekday: s.weigh_in_weekday,
      weigh_in_hour: s.weigh_in_hour,
      workout_reminders: s.workout_reminders,
      horizon_days: horizon,
      workouts,
    });
  });

  return r;
}
