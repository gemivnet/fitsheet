// explainAnalytics.ts — turns the Analytics numbers (TDEE, trend ± band, ETA, adherence, weekly
// bank) into a short plain-language read in Marmalade's voice. The screen shows real stats; this
// answers "what does this actually mean for me?". Grounded entirely in buildAnalytics — no guessing.

import { buildAnalytics } from '../analytics';
import { getSettings } from '../settings';
import { claudeText, FAST_MODEL } from './client';
import { MARMALADE } from './persona';
import type { DB } from '../db/index';
import { todayStr } from '../util';

export async function explainAnalytics(db: DB, date: string = todayStr()): Promise<string | null> {
  const s = getSettings(db);
  const a = buildAnalytics(db, s, date);
  // Not enough data yet → let the caller show the normal cold-start copy instead.
  if (a.tdee.estimate == null && a.weight.current_trend == null) return null;

  const facts = {
    units: s.units,
    calorie_goal: s.daily_calorie_goal,
    weight: a.weight,
    tdee: a.tdee,
    goal: a.goal,
    adherence: a.adherence,
    progress: a.progress,
  };
  const note = await claudeText({
    model: FAST_MODEL,
    system:
      `${MARMALADE}\n\n` +
      'Explain her analytics in plain language — what the numbers MEAN for her, not a list of them. ' +
      '2–4 short sentences. Cover the most useful one or two: estimated maintenance (TDEE) vs her goal ' +
      '(the gap is her daily deficit), the smoothed trend and whether it is real change or within the ' +
      'noise band, the ETA to goal and how confident it is, and her streaks/consistency. If the maintenance ' +
      'estimate is still missing, say warmly what would unlock it (a few more weigh-ins / logged days from ' +
      '`progress`). Be encouraging and specific; never shame. Plain sentences, no lists or headers.',
    content: `Her analytics as JSON:\n${JSON.stringify(facts)}\nExplain what it means for her.`,
    maxTokens: 240,
  });
  return note.trim() || null;
}
