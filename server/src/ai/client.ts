// client.ts — thin Claude helper shared by the AI features. Model is env-configurable
// (ANTHROPIC_MODEL, default Sonnet). No sampling params / thinking — these are simple,
// fast structured tasks. Gated by ANTHROPIC_API_KEY upstream (routes return 503 if absent).

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

type Content = Anthropic.MessageParam['content'];

// A fast, cheap model for short structured tasks (autocomplete, recaps, check-ins).
// Vision, menu pulls, and meal planning stay on the configured (bigger) model.
export const FAST_MODEL = 'claude-haiku-4-5';

// One shared client: the SDK retries transient 429/5xx itself (maxRetries) and the timeout
// bounds every call — a stuck connection can't hang a request forever.
let _client: Anthropic | null = null;
export function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 60_000, maxRetries: 2 });
  return _client;
}

export async function claudeText(opts: { system?: string; content: Content; maxTokens?: number; model?: string; timeoutMs?: number }): Promise<string> {
  const res = await client().messages.create(
    {
      model: opts.model ?? config.anthropicModel,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.content }],
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
  );
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Like claudeText, but streams text deltas to onText as they arrive; resolves with the full text. */
export async function claudeStream(opts: { system?: string; content: Content; maxTokens?: number; model?: string; timeoutMs?: number; onText: (delta: string) => void }): Promise<string> {
  const stream = client().messages.stream(
    {
      model: opts.model ?? config.anthropicModel,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.content }],
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
  );
  stream.on('text', (delta: string) => opts.onText(delta));
  const final = await stream.finalMessage();
  return final.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Pull the first JSON object/array out of a model reply and parse it. */
export function extractJson<T = any>(text: string): T | null {
  const m = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

const IMAGE_MEDIA = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const);
type ImageMedia = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/** Build a base64 image content block for vision calls (unknown types fall back to jpeg). */
export function imageBlock(base64: string, mediaType: string): Anthropic.ImageBlockParam {
  const mt: ImageMedia = IMAGE_MEDIA.has(mediaType as ImageMedia) ? (mediaType as ImageMedia) : 'image/jpeg';
  if (mt !== mediaType) console.warn(`[ai] unsupported image type ${mediaType}, sending as jpeg`);
  return { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } };
}
