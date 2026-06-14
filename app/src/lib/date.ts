// date.ts — local YYYY-MM-DD helpers for the app.

import { addDays, format, getHours, parseISO } from 'date-fns';

export function todayStr(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

export function addDaysStr(s: string, n: number): string {
  return format(addDays(parseISO(s), n), 'yyyy-MM-dd');
}

export function prettyDate(s: string): string {
  return parseISO(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export const isToday = (s: string): boolean => s === todayStr();

/** Meal slot guess from the current hour. */
export function slotForNow(d: Date = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  const h = getHours(d);
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}
