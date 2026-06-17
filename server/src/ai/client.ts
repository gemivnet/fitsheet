// client.ts — thin Claude helper shared by the AI features. Model is env-configurable
// (ANTHROPIC_MODEL, default Sonnet). No sampling params / thinking — these are simple,
// fast structured tasks. Gated by ANTHROPIC_API_KEY upstream (routes return 503 if absent).

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
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

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Multi-turn chat (Marmalade). Returns the assistant's reply text. */
export async function claudeChat(opts: { system: string; messages: ChatTurn[]; maxTokens?: number; model?: string }): Promise<string> {
  const res = await client().messages.create({
    model: opts.model ?? config.anthropicModel,
    max_tokens: opts.maxTokens ?? 400,
    system: opts.system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Multi-turn chat that returns a schema-validated object (reply + optional action). Null on
 *  refusal/truncation/parse failure, so the caller can fall back to a plain text reply. */
export async function claudeChatStructured<S extends z.ZodType>(opts: {
  system: string;
  messages: ChatTurn[];
  schema: S;
  maxTokens?: number;
  model?: string;
}): Promise<z.infer<S> | null> {
  try {
    const res = await client().messages.parse({
      model: opts.model ?? config.anthropicModel,
      max_tokens: opts.maxTokens ?? 600,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      output_config: { format: zodOutputFormat(opts.schema) },
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    return (res.parsed_output as z.infer<S>) ?? null;
  } catch (e) {
    console.warn('[ai] structured chat failed:', e);
    return null;
  }
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

/**
 * Research call: lets Claude use the server-side web_search + web_fetch tools (Anthropic runs them)
 * to find + read a source — including PDFs, which web_fetch auto-extracts. Returns the final text
 * plus any source URLs it touched (from the tool-result blocks). Not streamed: callers cache it.
 */
export async function claudeResearch(opts: {
  system?: string;
  content: Content;
  maxTokens?: number;
  model?: string;
  timeoutMs?: number;
  maxSearches?: number;
  maxFetches?: number;
}): Promise<{ text: string; sourceUrls: string[] }> {
  // web_fetch is newer than the pinned SDK's typed tool union, so build the tools array loosely.
  const tools = [
    { type: 'web_search_20250305', name: 'web_search', max_uses: opts.maxSearches ?? 3 },
    { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: opts.maxFetches ?? 3, citations: { enabled: true }, max_content_tokens: 60_000 },
  ] as unknown as Anthropic.Messages.ToolUnion[];

  const res = await client().messages.create(
    {
      model: opts.model ?? config.anthropicModel,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.content }],
      tools,
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
  );

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  // Best-effort: collect the URLs the tools actually fetched/cited from the result blocks.
  const urls = new Set<string>();
  for (const m of JSON.stringify(res.content).matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) {
    urls.add(m[0].replace(/[.,]+$/, ''));
  }
  return { text, sourceUrls: [...urls].slice(0, 8) };
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

/** Build a base64 PDF document block (Claude reads PDFs natively). */
export function documentBlock(base64: string): Anthropic.DocumentBlockParam {
  return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
}
