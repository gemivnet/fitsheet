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

/** YYYY-MM-DD shifted by n days. */
export function addDaysStr(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// Title-case a name (restaurant, etc.) so "chipotle" and "Chipotle" canonicalize to one value.
// Small connector words stay lowercase unless they're the first word.
const SMALL_WORDS = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'with', 'at', 'for', 'de', 'la', 'el', 'los', 'las', 'y']);
export function titleCase(s: string): string {
  const t = (s ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return t;
  return t
    .split(' ')
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lw)) return lw;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join(' ');
}
