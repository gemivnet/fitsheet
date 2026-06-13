// task.ts — the heart of the AI-native layer. An AiTask declares a system prompt, a zod
// output schema, and which slices of her history to inject. runTask() assembles the context,
// calls Claude with the schema as a hard constraint (structured outputs — the model can only
// reply with schema-valid JSON), and returns a typed, validated object. No regex JSON
// scraping, no "reply ONLY JSON" pleading. Refusals and truncation degrade to null, not crashes.
//
// This is the seam every JSON-returning feature should go through — parsing, suggestions,
// the anomaly detector, and whatever comes next.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { config } from '../config';
import type { DB } from '../db/index';
import { assembleContext, type ContextFlag } from './context';
import { client, FAST_MODEL } from './client';

type Content = Anthropic.MessageParam['content'];

export interface AiTask<S extends z.ZodType> {
  /** Short id, used in logs. */
  name: string;
  /** Persona + instructions. Stable across calls (so it caches well). */
  system: string;
  /** The shape the app gets back — enforced by the API, validated by zod. */
  schema: S;
  /** Which global-context slices to inject before the request. */
  globals?: ContextFlag[];
  /** Model override; defaults to the configured model. Pass 'fast' for the cheap model. */
  model?: string | 'fast';
  maxTokens?: number;
  timeoutMs?: number;
}

export interface TaskInput {
  /** The request itself + any per-call context (free text and/or image blocks). */
  content: string | Content;
  /** Client's local day, used to anchor the assembled context. */
  date?: string;
}

const FAST_ALIAS = 'fast';

/**
 * Run a task and get back its typed result, or null if the model declined, was truncated,
 * or returned something the schema rejected. Callers treat null as "no result this time".
 */
export async function runTask<S extends z.ZodType>(db: DB, task: AiTask<S>, input: TaskInput): Promise<z.infer<S> | null> {
  const ctx = assembleContext(db, task.globals, input.date);
  const userBlocks: Content =
    typeof input.content === 'string'
      ? ctx
        ? `${ctx}\n\n${input.content}`
        : input.content
      : ctx
        ? [{ type: 'text', text: ctx }, ...(input.content as Anthropic.ContentBlockParam[])]
        : input.content;

  const model = task.model === FAST_ALIAS ? FAST_MODEL : (task.model ?? config.anthropicModel);
  try {
    const res = await client().messages.parse(
      {
        model,
        max_tokens: task.maxTokens ?? 1024,
        system: task.system,
        messages: [{ role: 'user', content: userBlocks }],
        output_config: { format: zodOutputFormat(task.schema) },
      },
      task.timeoutMs ? { timeout: task.timeoutMs } : undefined,
    );
    if (res.stop_reason === 'refusal') {
      console.warn(`[ai:${task.name}] declined by the model`);
      return null;
    }
    if (res.stop_reason === 'max_tokens') {
      console.warn(`[ai:${task.name}] truncated at max_tokens; raise maxTokens for this task`);
      return null;
    }
    // parsed_output is already validated against the schema by the SDK helper.
    return (res.parsed_output as z.infer<S>) ?? null;
  } catch (e) {
    console.warn(`[ai:${task.name}] failed:`, e);
    return null;
  }
}
