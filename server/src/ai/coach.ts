// coach.ts — weekly check-in note + a calorie-fitting meal plan, both grounded in her real data.

import { buildAnalytics } from '../analytics';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { claudeText, extractJson, FAST_MODEL } from './client';
import { personalSlotHint } from './personalContext';

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
      'You are a warm, encouraging fitness companion. Write a SHORT weekly check-in (2-3 sentences, ' +
      "about 45 words) based on the user's data. Lead with the most genuinely notable thing this week — " +
      'a milestone, a streak, movement, or steady logging. Be specific and positive; never shame. If they ' +
      'are over goal, be gentle and supportive. Address them by name. Plain text only — no markdown, no lists.',
    content: `The user's data as JSON:\n${JSON.stringify(data)}\nWrite the check-in.`,
    maxTokens: 300,
  });
  return note.trim();
}

export interface MealPlan {
  days: { label: string; meals: { slot: string; name: string; kcal: number }[]; total: number }[];
}

export async function generateMealPlan(db: DB, days: number): Promise<MealPlan | null> {
  const s = getSettings(db);
  const recipes = db.prepare('SELECT name, approx_kcal, cook_band, tags_json FROM recipes ORDER BY is_favorite DESC, updated_at DESC LIMIT 40').all();
  const favorites = db.prepare('SELECT name, kcal_100g, serving_g FROM foods WHERE is_favorite = 1 LIMIT 40').all();
  // what she actually ate the last 3 days, so the plan doesn't repeat her dinners
  const recentRows = db
    .prepare("SELECT day_date, meal_slot, name FROM food_log WHERE day_date >= date('now','-3 days') ORDER BY day_date DESC")
    .all() as { day_date: string; meal_slot: string; name: string }[];
  const recent: Record<string, Record<string, string[]>> = {};
  for (const r of recentRows) ((recent[r.day_date] ??= {})[r.meal_slot] ??= []).push(r.name);
  const slotHint = personalSlotHint(db);
  const out = await claudeText({
    system:
      'You are a practical meal planner. Build a day-by-day plan whose daily totals stay at or under the ' +
      "calorie goal, and land reasonably close to the macro goals (protein especially). Strongly prefer the user's " +
      'saved recipes and favorite foods, and lean toward what they usually eat at each meal. Do NOT repeat ' +
      'dinners they had in the last three days. Reuse leftovers across days where it makes sense. Keep it ' +
      'simple and realistic for a busy home cook.',
    content:
      `Daily calorie goal: ${s.daily_calorie_goal}. Macro goals: protein ${s.protein_goal_g} g, carbs ${s.carb_goal_g} g, fat ${s.fat_goal_g} g. Number of days: ${days}.\n` +
      (slotHint ? `Their per-meal habits: ${slotHint}.\n` : '') +
      `What they ate the last 3 days (JSON): ${JSON.stringify(recent)}\n` +
      `Saved recipes (JSON): ${JSON.stringify(recipes)}\n` +
      `Favorite foods (JSON): ${JSON.stringify(favorites)}\n` +
      'Reply ONLY JSON: {"days":[{"label": string, "meals":[{"slot": string, "name": string, "kcal": number}], "total": number}]}',
    maxTokens: 2000,
  });
  return extractJson<MealPlan>(out);
}
