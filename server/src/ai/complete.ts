// complete.ts — short inline autocomplete for what she's typing (a food, or a restaurant order).
// The model returns the FULL most-likely name; we keep only the part after what she already typed.
// That single rule drops anything that doesn't actually continue her text (prose, refusals, wrong
// associations like "McDonalds" → "Big Mac") and preserves spacing. Fails to '' on anything odd.

import { claudeText, FAST_MODEL } from './client';
import { personalFoodsHint } from './personalContext';
import type { DB } from '../db/index';

const SYS =
  'You autocomplete a single food or restaurant item name a user is typing. Reply with ONLY the one ' +
  'most likely COMPLETE name, beginning with EXACTLY the characters they already typed and continuing ' +
  'them (keep their spelling and spacing at the start). If what they typed is already a complete name, ' +
  'reply with it unchanged. Output nothing but the name itself — no quotes, no explanation, no notes, ' +
  'no parentheses, no alternatives, no leading words like "Completion:".';

/** Reduce a raw model reply to a safe ghost-text suffix ('' when anything looks off). */
export function cleanSuffix(partial: string, raw: string): string {
  let full = (raw || '').split('\n')[0].trim();
  // unwrap symmetric quoting only — a possessive like "Trader Joe's" must survive
  for (const q of ['"', "'", '`']) {
    if (full.length >= 2 && full.startsWith(q) && full.endsWith(q)) full = full.slice(1, -1).trim();
  }
  if (!full || full.length <= partial.length) return '';
  // must literally continue what she typed — otherwise it's prose or a wrong guess; drop it
  if (full.slice(0, partial.length).toLowerCase() !== partial.toLowerCase()) return '';
  const suffix = full.slice(partial.length);
  // a real name completion has no sentence/bracket characters and is short
  if (/[(){}\[\]"<>:;.!?]/.test(suffix)) return '';
  if (suffix.length > 30) return '';
  if (suffix.trim().split(/\s+/).filter(Boolean).length > 5) return '';
  return suffix;
}

export async function complete(db: DB, text: string, context: string): Promise<string> {
  const partial = text;
  // bias toward foods/brands she actually logs, so "ch" → her "Chobani", not a generic guess
  const mine = personalFoodsHint(db);
  const hint = mine ? `\nFoods she logs often (prefer these when one matches): ${mine}.` : '';
  const run = (model?: string) =>
    claudeText({ model, system: SYS, content: `Context: ${context || 'food item'}${hint}\nThey typed: ${JSON.stringify(partial)}\nThe full name is:`, maxTokens: 24, timeoutMs: 10_000 });

  let out = '';
  try {
    out = await run(FAST_MODEL);
  } catch (e) {
    console.warn('[ai] fast completion failed, falling back:', e);
    try {
      out = await run();
    } catch {
      return '';
    }
  }
  return cleanSuffix(partial, out);
}
