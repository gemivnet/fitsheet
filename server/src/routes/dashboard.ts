import { Router } from 'express';
import { buildAnalytics } from '../analytics';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { todayStr } from '../util';
import { daySummary } from './foodLog';

// One call that powers the Home dashboard (avoids a fan-out of requests on launch).
export function dashboardRouter(db: DB): Router {
  const r = Router();
  r.get('/', (_req, res) => {
    const s = getSettings(db);
    const today = todayStr();
    const tomorrow = todayStr(new Date(Date.now() + 86_400_000));
    const a = buildAnalytics(db, s);
    const workout = db
      .prepare('SELECT * FROM workouts WHERE scheduled_date IN (?, ?) AND completed_at IS NULL ORDER BY scheduled_date ASC LIMIT 1')
      .get(today, tomorrow);
    const milestone = db.prepare('SELECT * FROM milestones WHERE acknowledged = 0 ORDER BY threshold_lb DESC LIMIT 1').get();
    res.json({
      settings: s,
      today: daySummary(db, today),
      weight: { current_trend: a.weight.current_trend, lbs_per_week: a.weight.lbs_per_week, label: a.weight.label, goal: a.goal },
      workout: workout ?? null,
      milestone: milestone ?? null,
    });
  });
  return r;
}
