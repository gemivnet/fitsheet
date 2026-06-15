// coach.ts — the weekly check-in note, grounded in her real data. (Meal planning moved to
// mealplan.ts, which uses the structured-output task layer.)

import { buildAnalytics } from '../analytics';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { claudeText, FAST_MODEL } from './client';
import { MARMALADE } from './persona';

export async function generateCheckin(db: DB): Promise<string> {
  const s = getSettings(db);
  const a = buildAnalytics(db, s);
  // the week as she lived it — macros, movement, eating out, wins
  const macro7 = db
    .prepare(
      "SELECT COUNT(DISTINCT day_date) AS days, ROUND(AVG(p)) AS protein, ROUND(AVG(c)) AS carb, ROUND(AVG(f)) AS fat FROM " +
        "(SELECT day_date, SUM(protein) AS p, SUM(carb) AS c, SUM(fat) AS f FROM food_log WHERE day_date >= date('now','-7 days') GROUP BY day_date)",
    )
    .get() as { days: number; protein: number | null; carb: number | null; fat: number | null };
  const workoutsDone = (db.prepare("SELECT COUNT(*) AS n FROM workouts WHERE completed_at >= datetime('now','-7 days')").get() as { n: number }).n;
  const outThis = (db.prepare("SELECT COUNT(*) AS n FROM (SELECT DISTINCT day_date, meal_slot FROM food_log WHERE eating_out = 1 AND day_date >= date('now','-7 days'))").get() as { n: number }).n;
  const outLast = (
    db.prepare("SELECT COUNT(*) AS n FROM (SELECT DISTINCT day_date, meal_slot FROM food_log WHERE eating_out = 1 AND day_date >= date('now','-14 days') AND day_date < date('now','-7 days'))").get() as { n: number }
  ).n;
  const milestones = db
    .prepare("SELECT kind, threshold_lb AS threshold FROM milestones WHERE acknowledged = 0 OR achieved_date >= date('now','-7 days') ORDER BY created_at DESC LIMIT 5")
    .all() as { kind: string; threshold: number }[];

  const data = {
    name: s.display_name,
    units: s.units,
    daily_calorie_goal: s.daily_calorie_goal,
    macro_goals: { protein_g: s.protein_goal_g, carb_g: s.carb_goal_g, fat_g: s.fat_goal_g },
    macro_7day_avg: macro7,
    workouts_done_this_week: workoutsDone,
    eating_out: { this_week: outThis, last_week: outLast },
    recent_milestones: milestones, // kind 'weight_loss' (lb) or 'logging_streak' (days)
    weight: a.weight,
    goal: a.goal,
    tdee: a.tdee,
    adherence: a.adherence,
  };
  const note = await claudeText({
    model: FAST_MODEL,
    system:
      `${MARMALADE}\n\n` +
      'Write a SHORT weekly check-in (2-3 sentences, about 45 words) based on her data — this is your ' +
      'little note to her. Lead with the most genuinely notable thing this week — a milestone, a streak, ' +
      'movement, or steady logging. Be specific and warm. If she is over goal, be gentle and supportive. ' +
      'Address her by name. Plain text only — no markdown, no lists.',
    content: `The user's data as JSON:\n${JSON.stringify(data)}\nWrite the check-in.`,
    maxTokens: 300,
  });
  return note.trim();
}
