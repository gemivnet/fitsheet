// complete.ts — short inline autocomplete for what she's typing (a food, or a restaurant order).
// Returns ONLY the suffix that finishes the most likely name. Uses a fast model; fails to ''.

import { claudeText } from './client';

// A fast, cheap model for keystroke-latency completions (falls back to the configured model on error).
const FAST_MODEL = 'claude-haiku-4-5-20251001';

export async function complete(text: string, context: string): Promise<string> {
  const run = (model?: string) =>
    claudeText({
      model,
      system:
        'You autocomplete what a user is typing into a food & meal-logging app. Given their partial ' +
        'text and optional context (like a restaurant), reply with ONLY the completion — the exact ' +
        'characters that come AFTER what they already typed to finish the single most likely item name. ' +
        'No quotes, no explanation, no restating their text, no trailing punctuation. If you have ' +
        'nothing useful, reply with nothing at all.',
      content: `Context: ${context || 'food item'}\nPartial: ${JSON.stringify(text)}\nCompletion:`,
      maxTokens: 24,
    });
  let out = '';
  try {
    out = await run(FAST_MODEL);
  } catch {
    out = await run(); // configured model
  }
  let s = (out || '').trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!s) return '';
  // the model sometimes echoes the whole name — keep only the part after what she typed
  if (s.toLowerCase().startsWith(text.toLowerCase())) s = s.slice(text.length);
  return s.replace(/\n.*$/s, '').slice(0, 40);
}
