// date.ts — local YYYY-MM-DD helpers for the app.

export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysStr(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function prettyDate(s: string): string {
  return new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export const isToday = (s: string): boolean => s === todayStr();

/** Meal slot guess from the current hour. */
export function slotForNow(d: Date = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  const h = d.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}
