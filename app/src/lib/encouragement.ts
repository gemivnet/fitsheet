// encouragement.ts — Marmalade's warm voice for quick moments (toasts, celebrations, idle), in one
// reviewable place. Short, kind, a little catty, never naggy. Pools keep repeated moments from
// sounding canned; pick() is plain random. (Error/utility copy stays plain — that lives at its call
// site, not here.)

// appended after "<food> logged — " on the first log of the day
export const FIRST_LOG_OF_DAY = ['first one in 🐾', 'and we’re off ✨', 'good morning to that', 'nice start'];

export const WORKOUT_DONE = ['Look at you go 💪', 'That counts — proud of you 🐾', 'Strong. I watched the whole time.', 'Done and dusted 💪'];

export const DAY_UNDER_GOAL = ['Under goal today — tidy work 🎉', 'Closed the day under. I’m purring.', 'Right where you wanted it ✨', 'Lovely day. Well done 🐾'];

// gentle, never an alarm — for the near/over-goal nudge
export const DAY_OVER_GOAL_GENTLE = ['A bit over today — one day never undoes you 🐾', 'Over a touch; tomorrow’s a fresh bowl.', 'No drama — we go again tomorrow.'];

export const WEIGH_IN_DONE = ['Logged. The trend line does the worrying, not you 🐾', 'Noted. One dot at a time.', 'Got it — that’s all I needed ✨'];

// Marmalade's idle voice — shown when you tap her and she has no real news. Warm, a little catty.
export const MARMALADE_IDLE = [
  'Mrrp. Just keeping you company. 🐾',
  'I keep an eye on your numbers so you don’t have to.',
  'You’re doing better than you think.',
  'Tap me anytime — I’m always around here somewhere.',
  'Logged something tasty? I’m nosy like that.',
  'Slow and steady. That’s how cats catch things too.',
  'No news from me means things look just fine.',
  'I rearranged your goals by sitting on them. You’re welcome.',
  'Hydration check. (I’m a cat, I have to ask.)',
  'Proud of you. Quietly, in a cat way.',
];

export function pick(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}
