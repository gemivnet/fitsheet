// anomalies.ts — Marmalade's "hey, this seems worth a look" detector. Given the recent data
// (intake vs goal, weigh-ins, the smoothed trend + its noise band, streaks), surface at most a
// couple of things that are GENUINELY unusual — never normal week-to-week variation, never
// shaming. Grounded by the task layer's context; output is a typed list the avatar can voice.

import { z } from 'zod';
import type { DB } from '../db/index';
import { runTask } from './task';

export const AnomalySchema = z.object({
  // 'fyi' = a friendly noticing; 'heads_up' = something that genuinely might matter.
  severity: z.enum(['fyi', 'heads_up']),
  title: z.string(),
  // one or two warm sentences in Marmalade's voice — this is her speech bubble.
  message: z.string(),
  // which screen helps her look closer, if any.
  action: z.enum(['none', 'open_day', 'open_weight', 'open_analytics']).catch('none'),
});
export const AnomalyResultSchema = z.object({ anomalies: z.array(AnomalySchema) });
export type Anomaly = z.infer<typeof AnomalySchema>;

const TASK = {
  name: 'anomalies',
  globals: ['recentDays', 'weightTrend', 'streaks', 'goals'] as const,
  model: 'fast' as const, // background check — keep it cheap
  maxTokens: 700,
  schema: AnomalyResultSchema,
  system:
    'You are Marmalade, a warm, perceptive orange cat who keeps a gentle eye on someone working on ' +
    'their health. Look over the recent data and surface AT MOST 2 things genuinely worth a soft note — ' +
    'a real change or pattern, not normal variation. Hard rules:\n' +
    '• The weight trend comes with a ± noise band. Anything inside that band is ordinary week-to-week ' +
    'fluctuation (water, food timing) — NEVER flag it as a change or a problem.\n' +
    '• Prefer "fyi". Reserve "heads_up" for something that clearly matters (e.g. several days well over ' +
    'goal in a row, or a logging streak that just broke).\n' +
    '• If nothing genuinely stands out, return an empty list. That is the common, healthy case — do not ' +
    'invent something to say.\n' +
    '• Never shame, never alarm, never nag about normal eating or a single high day. Celebrate when the ' +
    'notable thing is good (a long streak, steady progress).\n' +
    'Each message is one or two warm sentences in your own voice (a cat who is fond of her human). Set ' +
    'action to the screen that helps her look closer (open_day / open_weight / open_analytics) or "none".',
};

export async function generateAnomalies(db: DB, date: string): Promise<Anomaly[]> {
  const out = await runTask(db, { ...TASK, globals: [...TASK.globals] }, { content: 'Review the recent data above and note anything genuinely worth a gentle mention.', date });
  return out?.anomalies?.slice(0, 2) ?? [];
}
