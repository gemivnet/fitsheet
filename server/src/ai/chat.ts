// chat.ts — a real conversation with Marmalade. For the moments that matter: she's tempted to
// make a choice that won't serve her ("McDonald's after Chipotle"), and wants a friend who'll
// give honest, warm "good pressure" — acknowledge the craving, offer realistic alternatives from
// foods she actually likes, and nudge. Grounded in today's real numbers. Never shames, never
// pushes extreme restriction. An empty history asks Marmalade to open the conversation.

import { z } from 'zod';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { assembleContext } from './context';
import { claudeChatStructured, type ChatTurn } from './client';
import { ChatReplySchema } from './schemas';
import { MARMALADE } from './persona';
import { todayStr } from '../util';

export type ChatReply = z.infer<typeof ChatReplySchema>;

// She can DO things, not just talk — the client confirms anything that writes.
const ACTIONS =
  'You can also DO things for her, not just talk. When she CLEARLY asks, attach an "action":\n' +
  '• log_food — she wants food logged ("log a banana", "I had 2 eggs and toast"): kind "log_food", ' +
  'fill "items" (each: name + realistic grams + kcal + protein/carb/fat for that portion) and "slot" ' +
  'if she names a meal. The app confirms before saving.\n' +
  '• generate_plan — she wants a meal plan ("plan my week"): kind "generate_plan", "days" (default 7), optional "guidance".\n' +
  '• suggest_meal — she asks what to eat ("what should I have for dinner?"): kind "suggest_meal", "slot" if given.\n' +
  '• navigate — she wants to go somewhere ("show my weight"): kind "navigate", "screen" ∈ day|weight|analytics|mealplan|goals.\n' +
  'Otherwise set action to null (just chat). Keep "reply" warm and short, and make it match the action ' +
  '("Sure — logging a banana 🐾"). Never attach log_food or generate_plan unless she clearly wants it.';

// Her base voice (persona.ts) + what she's doing in THIS chat.
const PERSONA =
  `${MARMALADE}\n\n` +
  'Your job in this chat is to help her in moments of temptation or a tough food decision. Give honest, ' +
  'kind "good pressure": first acknowledge the craving like a real friend, then offer 2–3 concrete, ' +
  'realistic alternatives — lean on foods she actually eats and likes — and a gentle nudge toward the ' +
  'choice she’d be glad about tomorrow. If she’s already over for the day, reassure her that one day ' +
  'never undoes her progress, and help her either finish the day gently or set up a good tomorrow. ' +
  'Keep replies short — 2–4 sentences, conversational.';

function situation(db: DB, date: string): string {
  const s = getSettings(db);
  const eaten = Math.round((db.prepare('SELECT SUM(kcal) AS k FROM food_log WHERE day_date = ?').get(date) as { k: number | null }).k ?? 0);
  const goal = s.daily_calorie_goal;
  const diff = goal - eaten;
  const todays = (db.prepare('SELECT meal_slot, name FROM food_log WHERE day_date = ? ORDER BY id').all(date) as { meal_slot: string; name: string }[])
    .map((r) => `${r.meal_slot}: ${r.name}`)
    .join('; ');
  const ctx = assembleContext(db, ['goals', 'weightTrend', 'topFoods', 'mealHabits', 'recentDays', 'streaks'], date);
  return (
    `TODAY (${date}): she's eaten ${eaten} kcal of her ${goal} goal — ` +
    `${diff >= 0 ? `${diff} kcal left` : `${Math.abs(diff)} kcal OVER`}.\n` +
    `Eaten today: ${todays || 'nothing logged yet'}.\n${ctx}`
  );
}

export async function marmaladeReply(db: DB, history: ChatTurn[], date: string = todayStr()): Promise<ChatReply> {
  const system = `${PERSONA}\n\n${ACTIONS}\n\nHer real situation right now:\n${situation(db, date)}`;
  // Empty history → she opens with a warm, situation-aware hello.
  const messages: ChatTurn[] = history.length
    ? history
    : [{ role: 'user', content: '(She just opened the chat with you. Greet her warmly in one or two sentences, with a light nod to how her day is going so far, and invite her to tell you what’s up.)' }];
  const out = await claudeChatStructured({ system, messages, schema: ChatReplySchema, maxTokens: 600 });
  if (!out || !out.reply.trim()) return { reply: 'Mrrp — I didn’t quite catch that. Try again?', action: null };
  return { ...out, reply: out.reply.trim() };
}
