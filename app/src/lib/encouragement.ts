// encouragement.ts — the app's warm voice, in one reviewable place. Short, kind, never naggy.
// Pools keep repeated moments from sounding canned; pick() is plain random.

export const FIRST_LOG_OF_DAY = ['nice start to the day 🌱', 'day one tap at a time ✨', 'good start'];

export const WORKOUT_DONE = ['Nice work! 💪', 'Strong! 💪', 'Done and dusted 💪', 'That counts — well done'];

export const DAY_UNDER_GOAL = ['Under goal today — lovely work 🎉', 'Closed the day under goal 🎉', 'Right on target today ✨'];

// Marmalade's idle voice — shown when you tap her and she has no real news. Warm, a little catty.
export const MARMALADE_IDLE = [
  'Mrrp. Just keeping you company. 🐾',
  'I keep an eye on your numbers so you don’t have to.',
  'You’re doing better than you think.',
  'Tap me anytime — I’m always around here somewhere.',
  'Logged something tasty? I’m nosy like that.',
  'Slow and steady. That’s how cats catch things too.',
  'No news from me means things look just fine.',
];

export function pick(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}
