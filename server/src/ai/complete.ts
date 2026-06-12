// complete.ts — short inline autocomplete for what she's typing (a food, or a restaurant order).
// The model returns the FULL most-likely name; we keep only the part after what she already typed.
// That single rule drops anything that doesn't actually continue her text (prose, refusals, wrong
// associations like "McDonalds" → "Big Mac") and preserves spacing. Fails to '' on anything odd.

import { claudeText } from './client';

// A fast, cheap model for keystroke-latency completions (falls back to the configured model).
const FAST_MODEL = 'claude-haiku-4-5-20251001';

const SYS =
  'You autocomplete a single food or restaurant item name a user is typing. Reply with ONLY the one ' +
  'most likely COMPLETE name, beginning with EXACTLY the characters they already typed and continuing ' +
  'them (keep their spelling and spacing at the start). If what they typed is already a complete name, ' +
  'reply with it unchanged. Output nothing but the name itself — no quotes, no explanation, no notes, ' +
  'no parentheses, no alternatives, no leading words like "Completion:".';

export async function complete(text: string, context: string): Promise<string> {
  const partial = text;
  const run = (model?: string) =>
    claudeText({ model, system: SYS, content: `Context: ${context || 'food item'}\nThey typed: ${JSON.stringify(partial)}\nThe full name is:`, maxTokens: 24 });

  let out = '';
  try {
    out = await run(FAST_MODEL);
  } catch {
    try {
      out = await run();
    } catch {
      return '';
    }
  }

  // first line only, strip wrapping quotes/space
  let full = (out || '').split('\n')[0].replace(/^[\s"'`]+/, '').replace(/[\s"'`]+$/, '');
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
