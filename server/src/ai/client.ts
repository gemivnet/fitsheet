// client.ts — thin Claude helper shared by the AI features. Model is env-configurable
// (ANTHROPIC_MODEL, default Sonnet). No sampling params / thinking — these are simple,
// fast structured tasks. Gated by ANTHROPIC_API_KEY upstream (routes return 503 if absent).

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

type Content = Anthropic.MessageParam['content'];

export async function claudeText(opts: { system?: string; content: Content; maxTokens?: number; model?: string }): Promise<string> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const res = await client.messages.create({
    model: opts.model ?? config.anthropicModel,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: 'user', content: opts.content }],
  });
  return res.content
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

/** Build a base64 image content block for vision calls. */
export function imageBlock(base64: string, mediaType: string): Anthropic.ImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: base64 } };
}
