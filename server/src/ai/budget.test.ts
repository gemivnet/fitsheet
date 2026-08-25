import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb, type DB } from '../db/index';
import { migrate } from '../db/migrate';
import {
  BudgetExceededError,
  assertWithinBudget,
  budgetSummary,
  recordUsage,
  registerUsageDb,
} from './budget';

function freshDb(): DB {
  const db = openDb(':memory:');
  migrate(db);
  registerUsageDb(db);
  return db;
}

// List prices per 1M tokens, as of the pricing table in budget.ts:
//   Sonnet 4.6  $3 in / $15 out      Haiku 4.5  $1 in / $5 out
//   web_search  $10 per 1,000 searches
test('costs each model at its own published rate', () => {
  const db = freshDb();

  recordUsage('text', { input_tokens: 1_000_000, output_tokens: 1_000_000 }, 'claude-sonnet-4-6');
  assert.equal(budgetSummary(db).spentUsd, 18, '1M in + 1M out on Sonnet is $3 + $15');

  recordUsage('chat', { input_tokens: 1_000_000, output_tokens: 1_000_000 }, 'claude-haiku-4-5');
  assert.equal(budgetSummary(db).spentUsd, 24, 'plus $1 + $5 on Haiku');
});

test('bills web searches on top of tokens', () => {
  const db = freshDb();
  recordUsage(
    'research',
    { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 3 } },
    'claude-sonnet-4-6',
  );
  assert.equal(budgetSummary(db).spentUsd, 0.03, '3 searches at $10/1000');
});

// An unrecognised model must not spend for free -- that would be a silent hole in the cap.
test('charges an unknown model at the most expensive known rate', () => {
  const db = freshDb();
  recordUsage('text', { input_tokens: 1_000_000, output_tokens: 0 }, 'some-future-model');
  assert.equal(budgetSummary(db).spentUsd, 5, 'falls back to the Opus input rate, not zero');
});

test('a missing or partial usage object still records the call', () => {
  const db = freshDb();
  recordUsage('text', undefined, 'claude-sonnet-4-6');
  recordUsage('text', { output_tokens: 1_000_000 }, 'claude-sonnet-4-6');
  const s = budgetSummary(db);
  assert.equal(s.calls, 2, 'a call with no usage is still visible in the ledger');
  assert.equal(s.spentUsd, 15, 'and its known half is still charged');
});

test('assertWithinBudget throws once the cap is reached', () => {
  const db = freshDb();
  assert.doesNotThrow(() => assertWithinBudget(), 'empty ledger is under any cap');

  // Default cap is $10; 1M Sonnet output tokens is $15.
  recordUsage('text', { input_tokens: 0, output_tokens: 1_000_000 }, 'claude-sonnet-4-6');
  assert.throws(() => assertWithinBudget(), BudgetExceededError);
});

test('summary reports the month and remaining headroom', () => {
  const db = freshDb();
  recordUsage('text', { input_tokens: 1_000_000, output_tokens: 0 }, 'claude-sonnet-4-6'); // $3
  const s = budgetSummary(db);
  assert.equal(s.spentUsd, 3);
  assert.equal(s.remainingUsd, s.capUsd - 3);
  assert.match(s.month, /^\d{4}-\d{2}$/);
});
