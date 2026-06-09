// coach.ts — weekly check-in note + a calorie-fitting meal plan, both grounded in her real data.

import { buildAnalytics } from '../analytics';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { claudeText, extractJson } from './client';

export async function generateCheckin(db: DB): Promise<string> {
  const s = getSettings(db);
  const a = buildAnalytics(db, s);
  const data = {
    name: s.display_name,
    units: s.units,
    daily_calorie_goal: s.daily_calorie_goal,
    weight: a.weight,
    goal: a.goal,
    tdee: a.tdee,
    adherence: a.adherence,
  };
  const note = await claudeText({
    system:
      'You are a warm, encouraging fitness companion. Write a SHORT weekly check-in (2-3 sentences, ' +
      'about 45 words) based on the user\'s data. Be specific and positive; never shame. If they are over ' +
      'goal, be gentle and supportive. Address them by name. Plain text only — no markdown, no lists.',
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
  const out = await claudeText({
    system:
      'You are a practical meal planner. Build a day-by-day plan whose daily totals stay at or under the ' +
      'calorie goal. Strongly prefer the user\'s saved recipes and favorite foods. Reuse leftovers across ' +
      'days where it makes sense. Keep it simple and realistic for a busy home cook.',
    content:
      `Daily calorie goal: ${s.daily_calorie_goal}. Number of days: ${days}.\n` +
      `Saved recipes (JSON): ${JSON.stringify(recipes)}\n` +
      `Favorite foods (JSON): ${JSON.stringify(favorites)}\n` +
      'Reply ONLY JSON: {"days":[{"label": string, "meals":[{"slot": string, "name": string, "kcal": number}], "total": number}]}',
    maxTokens: 2000,
  });
  return extractJson<MealPlan>(out);
}
