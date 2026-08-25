// budget.ts — spend ceiling and ledger for the metered Anthropic calls.
//
// There was no accounting at all: ~20 AI endpoints, several with web_search enabled, and
// no way to answer "what has this cost me this month" or to stop a runaway loop. This
// records every call and refuses new ones once the month's cap is reached.
//
// Costs are integer micro-dollars ($1 = 1_000_000) so a month of sums cannot drift the
// way repeated float addition does.

import type { DB } from '../db/index';
import { config } from '../config';
import { nowIso, todayStr } from '../util';

/** Micro-dollars per token, per model. Anthropic list prices per 1M tokens:
 *  Sonnet 4.6 / Sonnet 5  $3 in / $15 out   ->  3 / 15
 *  Haiku 4.5              $1 in / $5 out    ->  1 / 5
 *  Opus 4.8 / Opus 5      $5 in / $25 out   ->  5 / 25
 *  (Sonnet 5 has a lower introductory rate; the list price is used so the cap errs high.) */
const PRICE: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-5': { input: 5, output: 25 },
};

/** Unknown model: bill at the most expensive known rate rather than zero, so an
 *  unrecognised model can never silently spend without counting against the cap. */
const FALLBACK_PRICE = { input: 5, output: 25 };

/** Anthropic bills web search at $10 per 1,000 searches. */
const MICROS_PER_WEB_SEARCH = 10_000;

/** Monthly ceiling in micro-dollars. Default $10, deliberately conservative — this is a
 *  single-user app, so anything approaching it means a loop, not real usage. */
const MAX_MONTHLY_MICROS = Math.round(Number(process.env.MAX_MONTHLY_USD ?? '10') * 1_000_000);

// The AI client is constructed without a DB handle and is called from ~20 places, so the
// ledger registers itself once at boot rather than threading a db argument through all of
// them. Until it is registered, recording is a no-op and the cap is not enforced -- which
// is why registerUsageDb runs before any route is mounted.
let ledgerDb: DB | null = null;

export function registerUsageDb(db: DB): void {
  ledgerDb = db;
}

export class BudgetExceededError extends Error {
  readonly spentMicros: number;
  readonly capMicros: number;
  constructor(spentMicros: number, capMicros: number) {
    super(
      `AI budget reached: $${(spentMicros / 1_000_000).toFixed(2)} of ` +
        `$${(capMicros / 1_000_000).toFixed(2)} this month. ` +
        `Raise MAX_MONTHLY_USD to continue.`,
    );
    this.name = 'BudgetExceededError';
    this.spentMicros = spentMicros;
    this.capMicros = capMicros;
  }
}

function monthPrefix(): string {
  return todayStr().slice(0, 7); // YYYY-MM
}

/** Micro-dollars spent so far this calendar month. */
export function spentThisMonth(db: DB): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_micros), 0) AS total FROM ai_usage WHERE day_date LIKE ?`,
    )
    .get(`${monthPrefix()}%`) as { total: number };
  return row.total;
}

/**
 * Call before starting any billed request. Throws BudgetExceededError when the month's
 * cap is already reached.
 *
 * The check is deliberately before the call rather than after: it can overshoot by at
 * most one request, which is the same trade every pre-request gate makes.
 */
export function assertWithinBudget(): void {
  const db = ledgerDb;
  if (!db) return;
  const spent = spentThisMonth(db);
  if (spent >= MAX_MONTHLY_MICROS) {
    throw new BudgetExceededError(spent, MAX_MONTHLY_MICROS);
  }
}

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/**
 * Record one API call. Safe to call with a partial or missing usage object — an
 * unparseable usage still writes a row, so a call is never invisible to the ledger.
 */
export function recordUsage(
  feature: string,
  usage: UsageLike | null | undefined,
  model: string = config.anthropicModel,
): void {
  const db = ledgerDb;
  if (!db) return;
  const price = PRICE[model] ?? FALLBACK_PRICE;

  // Cache reads/writes are billed at different multiples of the input rate. Counting
  // them at the full input rate overstates slightly, which is the safe direction here.
  const input =
    (usage?.input_tokens ?? 0) +
    (usage?.cache_creation_input_tokens ?? 0) +
    (usage?.cache_read_input_tokens ?? 0);
  const output = usage?.output_tokens ?? 0;
  const searches = usage?.server_tool_use?.web_search_requests ?? 0;

  const costMicros =
    input * price.input + output * price.output + searches * MICROS_PER_WEB_SEARCH;

  try {
    db.prepare(
      `INSERT INTO ai_usage (day_date, feature, model, input_tokens, output_tokens, cost_micros, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(todayStr(), feature, model, input, output, costMicros, nowIso());
  } catch {
    // Accounting must never take down the feature it is measuring.
  }
}

export interface BudgetSummary {
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
  calls: number;
  month: string;
}

/** The month's figures, for the settings screen and the per-run footer. */
export function budgetSummary(db: DB): BudgetSummary {
  const spent = spentThisMonth(db);
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ai_usage WHERE day_date LIKE ?`)
    .get(`${monthPrefix()}%`) as { n: number };
  return {
    spentUsd: spent / 1_000_000,
    capUsd: MAX_MONTHLY_MICROS / 1_000_000,
    remainingUsd: Math.max(0, MAX_MONTHLY_MICROS - spent) / 1_000_000,
    calls: row.n,
    month: monthPrefix(),
  };
}
