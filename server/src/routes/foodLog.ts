import { Router } from 'express';
import { invalidatePersonalContext } from '../ai/personalContext';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { getSettings } from '../settings';
import { addDaysStr, clamp, cleanDiningName, finiteNum, hourOfDay, isDayStr, nowIso, round, todayStr } from '../util';

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

interface LogRow {
  id: number;
  day_date: string;
  meal_slot: string;
  food_id: number | null;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  sort_order: number;
  eating_out: number;
}

export function daySummary(db: DB, date: string) {
  const s = getSettings(db);
  const goal = s.daily_calorie_goal;
  const rows = db.prepare('SELECT * FROM food_log WHERE day_date = ? ORDER BY meal_slot, sort_order, id').all(date) as LogRow[];
  const slots: Record<string, LogRow[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
  const slotKcal: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
  const totals = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  for (const r of rows) {
    (slots[r.meal_slot] ??= []).push(r);
    slotKcal[r.meal_slot] = (slotKcal[r.meal_slot] ?? 0) + r.kcal;
    totals.kcal += r.kcal;
    totals.protein += r.protein;
    totals.carb += r.carb;
    totals.fat += r.fat;
  }
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = round(totals[k], 0);

  // ── weekly calorie banking: roll prior over/under into today's target ──
  // Only count a prior day if its intake looks like a real, complete log. A barely-logged
  // day would otherwise bank a huge phantom surplus into today; an absurd over-log would
  // trim today unfairly. Days outside a sane window are skipped (treated as a logging gap).
  const bankLo = Math.max(500, goal * 0.4);
  const bankHi = goal * 2.5;
  const intakeOn = (d: string): number | null => {
    const r = db.prepare('SELECT SUM(kcal) AS k FROM food_log WHERE day_date = ?').get(d) as { k: number | null };
    return r.k == null ? null : r.k;
  };
  let bankWeek = 0;
  let bankSkipped = 0; // logged days that looked partial/erroneous and were left out
  for (let i = 1; i <= 6; i++) {
    const v = intakeOn(addDaysStr(date, -i));
    if (v == null) continue; // unlogged day — nothing to bank
    if (v < bankLo || v > bankHi) {
      bankSkipped++; // insanely off — ignore (logging gap or error), but tell her
      continue;
    }
    bankWeek += goal - v; // under = positive (headroom), over = negative
  }
  bankWeek = Math.round(bankWeek);
  const yIntake = intakeOn(addDaysStr(date, -1));
  const bankYesterday = yIntake == null ? null : Math.round(goal - yIntake);

  // Per-meal "complete" ticks (organizational only).
  const slotsComplete: Record<string, boolean> = { breakfast: false, lunch: false, dinner: false, snacks: false };
  for (const r of db.prepare('SELECT meal_slot FROM meal_complete WHERE day_date = ?').all(date) as { meal_slot: string }[]) {
    slotsComplete[r.meal_slot] = true;
  }

  // She can "snooze" the bank for a single day → that day uses the plain goal.
  const snoozed = !!db.prepare('SELECT 1 FROM bank_snooze WHERE day_date = ?').get(date);
  const adjustment = s.weekly_banking && !snoozed ? clamp(bankWeek, -800, 800) : 0;
  const adjustedGoal = Math.max(1200, goal + adjustment);
  // Transparency: did the ±800 clamp or the 1200 floor change what the bank really says?
  const bankCapped = s.weekly_banking && !snoozed && (adjustment !== bankWeek || goal + adjustment < 1200);

  return {
    date,
    goal,
    totals,
    remaining: Math.round(goal - totals.kcal),
    slots,
    slot_kcal: slotKcal,
    slots_complete: slotsComplete,
    banking: s.weekly_banking,
    bank_week: bankWeek,
    bank_capped: bankCapped,
    bank_skipped_days: bankSkipped,
    bank_yesterday: bankYesterday,
    bank_snoozed: snoozed,
    adjusted_goal: adjustedGoal,
    adjusted_remaining: Math.round(adjustedGoal - totals.kcal),
  };
}

// Celebrate showing up: when the logging streak ending on `date` crosses 7 or 30 days,
// record a milestone (same table + dashboard → celebration pipeline as weight milestones).
// INSERT OR IGNORE + the (kind, threshold) unique index = each fires once, never nags.
function detectStreakMilestones(db: DB, date: string): void {
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    if (!db.prepare('SELECT 1 FROM food_log WHERE day_date = ? LIMIT 1').get(addDaysStr(date, -i))) break;
    streak++;
  }
  const ins = db.prepare("INSERT OR IGNORE INTO milestones (kind, threshold_lb, achieved_date, acknowledged, created_at) VALUES ('logging_streak', ?, ?, 0, ?)");
  for (const threshold of [7, 30]) if (streak >= threshold) ins.run(threshold, date, nowIso());
}

/**
 * Link a food_id-less log entry to her library: exact case-insensitive name match first,
 * else create a 'described' food so it can be suggested and re-logged in one tap later.
 * Skips: dining orders (eating_out — those have their own save flow), zero-calorie payloads,
 * the 'Food' fallback name, and callers that opt out (auto_food: false, e.g. the dish
 * builder's log-a-portion, whose "Save dish" button is the explicit library affordance).
 * Matching is exact-only on purpose — "scrambled egg" vs "scrambled eggs" makes a dupe,
 * but a false fuzzy merge would silently log the wrong nutrition, which is worse.
 */
function resolveFoodId(db: DB, b: Record<string, any>, ts: string): { id: number | null; created: boolean } {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name === 'Food') return { id: null, created: false };
  const existing = db.prepare('SELECT id FROM foods WHERE LOWER(name) = LOWER(?) ORDER BY updated_at DESC LIMIT 1').get(name) as { id: number } | undefined;
  if (existing) return { id: existing.id, created: false };
  const kcal100 = finiteNum(b.kcal_100g) ?? 0;
  if (kcal100 <= 0 || b.eating_out || b.auto_food === false) return { id: null, created: false };
  const info = db
    .prepare(
      'INSERT INTO foods (name,brand,barcode,source,off_id,serving_g,serving_label,unit_name,restaurant,eating_out,kcal_100g,protein_100g,carb_100g,fat_100g,label_photo,is_favorite,created_at,updated_at) ' +
        'VALUES (?,NULL,NULL,?,NULL,NULL,NULL,NULL,NULL,0,?,?,?,?,NULL,0,?,?)',
    )
    .run(name, 'described', kcal100, finiteNum(b.protein_100g) ?? 0, finiteNum(b.carb_100g) ?? 0, finiteNum(b.fat_100g) ?? 0, ts, ts);
  const id = Number(info.lastInsertRowid);
  writeAudit(db, { entity: 'food', entityId: id, action: 'create' });
  return { id, created: true };
}

export function foodLogRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const date = (req.query.date as string) || todayStr();
    res.json(daySummary(db, date));
  });

  // "Your usual meal": foods she logs in this slot on most days → a template she can tweak + log.
  // Weekday and weekend habits differ (weekday toast vs weekend pancakes), so the requested
  // date's day-of-week picks which population to mine. Macros come from the LATEST time she
  // logged each food (brands change) rather than a long-run average.
  r.get('/usual', (req, res) => {
    const slot = SLOTS.includes(req.query.slot as (typeof SLOTS)[number]) ? (req.query.slot as string) : 'breakfast';
    const date = isDayStr(req.query.date) ? req.query.date : todayStr();
    const dow = new Date(`${date}T00:00:00`).getDay();
    const weekend = dow === 0 || dow === 6;
    // weekends are rarer, so look further back to find the pattern
    const from = addDaysStr(date, weekend ? -28 : -14);
    const to = addDaysStr(date, -1);
    const dowFilter = weekend ? "strftime('%w', day_date) IN ('0','6')" : "strftime('%w', day_date) NOT IN ('0','6')";
    const rows = db
      .prepare(`SELECT * FROM food_log WHERE meal_slot = ? AND day_date BETWEEN ? AND ? AND ${dowFilter} ORDER BY day_date DESC, id DESC`)
      .all(slot, from, to) as LogRow[];
    const totalDays = new Set(rows.map((x) => x.day_date)).size;
    if (totalDays < 2) return res.json({ found: false, slot, days_seen: totalDays, items: [] });

    // group by name: distinct-day count + the most recent variant (rows are newest-first)
    const byName = new Map<string, { latest: LogRow; days: Set<string> }>();
    for (const row of rows) {
      const key = row.name.toLowerCase();
      const g = byName.get(key);
      if (g) g.days.add(row.day_date);
      else byName.set(key, { latest: row, days: new Set([row.day_date]) });
    }
    const threshold = Math.max(2, Math.ceil(totalDays * 0.6)); // a real habit, not a coin flip
    const items = [...byName.values()]
      .filter((g) => g.days.size >= threshold && g.latest.grams > 0)
      .sort((a, b) => b.days.size - a.days.size)
      .map(({ latest }) => ({
        food_id: latest.food_id ?? null,
        name: latest.name,
        grams: Math.round(latest.grams),
        kcal_100g: Math.round((latest.kcal * 100) / latest.grams),
        protein_100g: round((latest.protein * 100) / latest.grams, 1),
        carb_100g: round((latest.carb * 100) / latest.grams, 1),
        fat_100g: round((latest.fat * 100) / latest.grams, 1),
      }));
    res.json({ found: items.length >= 1, slot, days_seen: totalDays, items });
  });

  // Gentle "eating out" counter: distinct meals (day+slot) eaten out this week vs last week.
  r.get('/dining-stats', (req, res) => {
    const date = (req.query.date as string) || todayStr();
    const count = (from: string, to: string): number =>
      (db.prepare('SELECT COUNT(*) AS n FROM (SELECT DISTINCT day_date, meal_slot FROM food_log WHERE eating_out = 1 AND day_date BETWEEN ? AND ?)').get(from, to) as { n: number }).n;
    res.json({ this_week: count(addDaysStr(date, -6), date), last_week: count(addDaysStr(date, -13), addDaysStr(date, -7)) });
  });

  // Toggle the calorie bank off (or back on) for a single day.
  r.post('/snooze', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const date = b.date || todayStr();
    const on = b.snoozed !== false; // default: snooze on
    if (on) db.prepare('INSERT OR IGNORE INTO bank_snooze (day_date, created_at) VALUES (?, ?)').run(date, nowIso());
    else db.prepare('DELETE FROM bank_snooze WHERE day_date = ?').run(date);
    writeAudit(db, { entity: 'bank_snooze', entityId: 0, action: on ? 'create' : 'delete', diff: { date } });
    res.json(daySummary(db, date));
  });

  // Tick a meal complete (or un-tick) for a day.
  r.post('/meal-complete', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const date = b.date || todayStr();
    const slot = SLOTS.includes(b.meal_slot) ? b.meal_slot : null;
    if (!slot) return res.status(400).json({ error: 'bad meal_slot' });
    const on = b.complete !== false; // default: mark complete
    if (on) db.prepare('INSERT OR IGNORE INTO meal_complete (day_date, meal_slot, created_at) VALUES (?, ?, ?)').run(date, slot, nowIso());
    else db.prepare('DELETE FROM meal_complete WHERE day_date = ? AND meal_slot = ?').run(date, slot);
    writeAudit(db, { entity: 'meal_complete', entityId: 0, action: on ? 'create' : 'delete', diff: { date, slot } });
    res.json(daySummary(db, date));
  });

  r.post('/', (req, res) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const date = isDayStr(b.date) ? b.date : todayStr();
    const slot = SLOTS.includes(b.meal_slot) ? b.meal_slot : 'snacks';
    const grams = finiteNum(b.grams);
    if (grams == null || grams <= 0) return res.status(400).json({ error: 'grams must be a positive number' });
    const factor = grams / 100;
    const kcal = round((finiteNum(b.kcal_100g) ?? 0) * factor, 0);
    const protein = round((finiteNum(b.protein_100g) ?? 0) * factor, 1);
    const carb = round((finiteNum(b.carb_100g) ?? 0) * factor, 1);
    const fat = round((finiteNum(b.fat_100g) ?? 0) * factor, 1);
    const ts = nowIso();
    // The learning loop: a log without a food_id (Describe, usual meal, meal plan, recipe)
    // still teaches the app — link it to an existing food by name, or save it as a new one,
    // so it feeds suggestions, "your usual", and the AI's personal context from now on.
    let foodId: number | null = b.food_id ?? null;
    let createdFood = false;
    if (foodId == null) {
      const resolved = resolveFoodId(db, b, ts);
      foodId = resolved.id;
      createdFood = resolved.created;
    }
    // eating-out flag: explicit from the client, else inherited from the saved food.
    let eatingOut = b.eating_out != null ? (b.eating_out ? 1 : 0) : 0;
    if (b.eating_out == null && foodId != null && !createdFood) {
      const f = db.prepare('SELECT eating_out FROM foods WHERE id = ?').get(foodId) as { eating_out: number } | undefined;
      eatingOut = f?.eating_out ? 1 : 0;
    }
    // Eating-out names are stored "Restaurant · Item"; canonicalize the casing and de-stutter
    // a brand the AI repeated in the item, so the diary never shows "shake shack · Shake Shack…".
    const logName = eatingOut ? cleanDiningName(b.name ?? 'Food') : (b.name ?? 'Food');
    const info = db
      .prepare(
        'INSERT INTO food_log (day_date,meal_slot,food_id,name,grams,kcal,protein,carb,fat,sort_order,eating_out,created_at,hour_local) ' +
          'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(date, slot, foodId, logName, grams, kcal, protein, carb, fat, Date.now() % 100000, eatingOut, ts, hourOfDay(b.hour));
    // Remember how this food was entered (grams vs servings) and the amount, so re-adding
    // it pre-fills the same way. Bumping updated_at also floats it up the "My foods" list.
    if (foodId != null) {
      const um = b.unit_mode === 'servings' ? 'servings' : b.unit_mode === 'grams' ? 'grams' : null;
      db.prepare('UPDATE foods SET pref_unit_mode = COALESCE(?, pref_unit_mode), last_grams = ?, updated_at = ? WHERE id = ?').run(um, grams, ts, foodId);
    }
    const addedId = Number(info.lastInsertRowid);
    invalidatePersonalContext(); // her habits just changed
    detectStreakMilestones(db, date);
    writeAudit(db, { entity: 'food_log', entityId: addedId, action: 'create' });
    res.json({ ...daySummary(db, date), added_id: addedId });
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM food_log WHERE id = ?').get(id) as LogRow | undefined;
    if (!row) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, any>;
    let { grams, kcal, protein, carb, fat } = row;
    const newGrams = finiteNum(b.grams);
    if (b.grams != null && (newGrams == null || newGrams <= 0)) return res.status(400).json({ error: 'grams must be a positive number' });
    if (newGrams != null && row.grams > 0) {
      const ratio = newGrams / row.grams;
      grams = newGrams;
      kcal = round(row.kcal * ratio, 0);
      protein = round(row.protein * ratio, 1);
      carb = round(row.carb * ratio, 1);
      fat = round(row.fat * ratio, 1);
    }
    const slot = b.meal_slot && SLOTS.includes(b.meal_slot) ? b.meal_slot : row.meal_slot;
    db.prepare('UPDATE food_log SET grams=?,kcal=?,protein=?,carb=?,fat=?,meal_slot=? WHERE id=?').run(grams, kcal, protein, carb, fat, slot, id);
    writeAudit(db, { entity: 'food_log', entityId: id, action: 'update' });
    res.json(daySummary(db, row.day_date));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT day_date FROM food_log WHERE id = ?').get(id) as { day_date: string } | undefined;
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare('DELETE FROM food_log WHERE id = ?').run(id);
    invalidatePersonalContext();
    writeAudit(db, { entity: 'food_log', entityId: id, action: 'delete' });
    res.json(daySummary(db, row.day_date));
  });

  return r;
}
