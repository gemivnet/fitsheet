// Small shared helpers.

export const nowIso = (): string => new Date().toISOString();

/** Local calendar date as YYYY-MM-DD (server TZ). */
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Round to n decimals, returning a number. */
export const round = (n: number, dp = 1): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
