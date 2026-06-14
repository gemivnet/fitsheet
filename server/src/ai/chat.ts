// chat.ts — a real conversation with Marmalade. For the moments that matter: she's tempted to
// make a choice that won't serve her ("McDonald's after Chipotle"), and wants a friend who'll
// give honest, warm "good pressure" — acknowledge the craving, offer realistic alternatives from
// foods she actually likes, and nudge. Grounded in today's real numbers. Never shames, never
// pushes extreme restriction. An empty history asks Marmalade to open the conversation.

import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { assembleContext } from './context';
import { claudeChat, type ChatTurn } from './client';
import { todayStr } from '../util';

const PERSONA =
  'You are Marmalade — an orange cat who is the companion in this person’s health app and adores her. ' +
  'You talk like a warm, witty friend who happens to be a cat: a little playful, never preachy. Your ' +
  'job in this chat is to help her in moments of temptation or a tough food decision. Give honest, ' +
  'kind "good pressure": first acknowledge the craving like a real friend, then offer 2–3 concrete, ' +
  'realistic alternatives — lean on foods she actually eats and likes — and a gentle nudge toward the ' +
  'choice she’d be glad about tomorrow. Rules: never shame, guilt, or moralize about food; never push ' +
  'skipping meals, "earning" food, purging, or extreme restriction; no medical advice. If she’s already ' +
  'over for the day, reassure her that one day never undoes her progress, and help her either finish ' +
  'the day gently or set up a good tomorrow. Keep replies short — 2–4 sentences, conversational. A ' +
  'little cat warmth is welcome (an occasional 🐾 or "mrrp"), but don’t overdo it.';

function situation(db: DB, date: string): string {
  const s = getSettings(db);
  const eaten = Math.round((db.prepare('SELECT SUM(kcal) AS k FROM food_log WHERE day_date = ?').get(date) as { k: number | null }).k ?? 0);
  const goal = s.daily_calorie_goal;
  const diff = goal - eaten;
  const todays = (db.prepare('SELECT meal_slot, name FROM food_log WHERE day_date = ? ORDER BY id').all(date) as { meal_slot: string; name: string }[])
    .map((r) => `${r.meal_slot}: ${r.name}`)
    .join('; ');
  const ctx = assembleContext(db, ['goals', 'weightTrend', 'topFoods', 'mealHabits'], date);
  return (
    `TODAY (${date}): she's eaten ${eaten} kcal of her ${goal} goal — ` +
    `${diff >= 0 ? `${diff} kcal left` : `${Math.abs(diff)} kcal OVER`}.\n` +
    `Eaten today: ${todays || 'nothing logged yet'}.\n${ctx}`
  );
}

export async function marmaladeReply(db: DB, history: ChatTurn[], date: string = todayStr()): Promise<string> {
  const system = `${PERSONA}\n\nHer real situation right now:\n${situation(db, date)}`;
  // Empty history → she opens with a warm, situation-aware hello.
  const messages: ChatTurn[] = history.length
    ? history
    : [{ role: 'user', content: '(She just opened the chat with you. Greet her warmly in one or two sentences, with a light nod to how her day is going so far, and invite her to tell you what’s up.)' }];
  const reply = await claudeChat({ system, messages, maxTokens: 400 });
  return reply.trim();
}
