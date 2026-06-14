// activity.ts — simple, honest walking estimates. Pace is calibrated to her 2.2 mi loop ≈ 45 min
// (~20.5 min/mile, a brisk-ish stroll). Calories use the standard walking heuristic of ~0.53 kcal
// per pound of body weight per mile (net), so they scale with her actual weight.

const MIN_PER_MILE = 20.5;
const KCAL_PER_LB_MILE = 0.53;

export const estWalkMinutes = (miles: number): number => Math.round(miles * MIN_PER_MILE);

/** Estimated calories: prefers distance, falls back to deriving distance from minutes. */
export function estWalkKcal(opts: { miles?: number | null; minutes?: number | null; weightLb: number }): number {
  const miles = opts.miles && opts.miles > 0 ? opts.miles : opts.minutes && opts.minutes > 0 ? opts.minutes / MIN_PER_MILE : 0;
  return Math.round(KCAL_PER_LB_MILE * opts.weightLb * miles);
}
