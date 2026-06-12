// encouragement.ts — the app's warm voice, in one reviewable place. Short, kind, never naggy.
// Pools keep repeated moments from sounding canned; pick() is plain random.

export const FIRST_LOG_OF_DAY = ['nice start to the day 🌱', 'day one tap at a time ✨', 'good start'];

export const WORKOUT_DONE = ['Nice work! 💪', 'Strong! 💪', 'Done and dusted 💪', 'That counts — well done'];

export const DAY_UNDER_GOAL = ['Under goal today — lovely work 🎉', 'Closed the day under goal 🎉', 'Right on target today ✨'];

export function pick(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}
