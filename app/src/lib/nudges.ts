// nudges.ts — gentle, opt-out memory for Marmalade's proactive nudges. The companion is a client
// concern, so the on/off preference and the "shown today" rate-limit live in localStorage (no server
// migration). Each nudge type shows at most once a day, and the whole feature can be switched off.

import { todayStr } from './date';

const ENABLED_KEY = 'marmalade-nudges';
const seenKey = (kind: string) => `marmalade-nudge:${kind}`;

export function nudgesEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return true;
    return window.localStorage?.getItem(ENABLED_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setNudgesEnabled(on: boolean): void {
  try {
    window.localStorage?.setItem(ENABLED_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

/** Has this nudge kind already been surfaced today? */
export function nudgeSeenToday(kind: string): boolean {
  try {
    return window.localStorage?.getItem(seenKey(kind)) === todayStr();
  } catch {
    return false;
  }
}
export function markNudgeSeen(kind: string): void {
  try {
    window.localStorage?.setItem(seenKey(kind), todayStr());
  } catch {
    /* ignore */
  }
}
