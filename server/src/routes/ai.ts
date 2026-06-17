import { Router } from 'express';
import { generateCheckin } from '../ai/coach';
import { assembleStored, buildMealPlanContent, generateMealPlan, MEALPLAN_SYSTEM, type KeptMeal, type StoredPlan } from '../ai/mealplan';
import { MealPlanSchema } from '../ai/schemas';
import { getWeeklyGoals, saveWeeklyGoals, suggestWeeklyGoals } from '../ai/weeklyGoals';
import { extractLabel } from '../ai/extractLabel';
import { parseFood } from '../ai/parseFood';
import { parseFoodPhoto } from '../ai/parseFoodPhoto';
import { parseRecipe, parseRecipeFromUrl, parseRecipePdf } from '../ai/parseRecipe';
import { restaurantHistory } from '../ai/personalContext';
import { claudeStream, extractJson } from '../ai/client';
import { complete } from '../ai/complete';
import { generateDayInsights } from '../ai/dayInsights';
import { explainAnalytics } from '../ai/explainAnalytics';
import { type Anomaly, generateAnomalies } from '../ai/anomalies';
import { marmaladeReply } from '../ai/chat';
import type { ChatTurn } from '../ai/client';
import { cleanComponents, FULL_MENU_SYSTEM, fullMenuContent, restaurantFullMenu, restaurantItem, salvageObjects } from '../ai/restaurantItem';
import { buildCustomItem, getRestaurantMenu, loadRestaurantItems } from '../ai/restaurantNutrition';
import { hasAnthropicKey } from '../config';
import type { DB } from '../db/index';
import { upload } from '../upload';
import { isDayStr, nowIso, titleCase, todayStr } from '../util';

const NO_KEY = { error: 'no_api_key' };

// AI failures are logged in full server-side; clients get a clean error code only.
function aiFail(res: { status: (n: number) => { json: (o: unknown) => unknown } }, what: string, e: unknown): void {
  console.warn(`[ai] ${what} failed:`, e);
  res.status(502).json({ error: `${what}_failed` });
}

function maxMilestoneId(db: DB): number {
  return ((db.prepare('SELECT MAX(id) AS m FROM milestones').get() as { m: number | null }).m ?? 0) as number;
}

// app state stored as JSON in the generic settings KV (meal plan, weekly goals) — same pattern
// as the cached AI blobs, no migration needed.
function readBlob<T>(db: DB, key: string): T | null {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as { value_json: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}
function writeBlob(db: DB, key: string, value: unknown): void {
  db.prepare(
    'INSERT INTO settings (key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at',
  ).run(key, JSON.stringify(value), nowIso());
}

function cacheCheckin(db: DB, note: string): void {
  db.prepare(
    "INSERT INTO settings (key,value_json,updated_at) VALUES ('checkin',?,?) " +
      'ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at',
  ).run(JSON.stringify({ note, generated_at: nowIso(), max_milestone_id: maxMilestoneId(db) }), nowIso());
}

export function aiRouter(db: DB): Router {
  const r = Router();

  // ── nutrition label → custom food (photo always saved) ──────────────────
  r.post('/extract-label', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    if (!hasAnthropicKey()) return res.status(503).json({ error: 'no_api_key', label_photo: req.file.filename, nutrition: null });
    try {
      const nutrition = await extractLabel(db, req.file.path, req.file.mimetype);
      res.json({ nutrition, label_photo: req.file.filename, confidence: nutrition?.confidence ?? 'low' });
    } catch (e) {
      console.warn('[ai] extract-label failed:', e);
      res.status(502).json({ error: 'extract_failed', label_photo: req.file.filename, nutrition: null });
    }
  });

  // ── inline autocomplete (ghost text); always 200, empty when off/unsure ──
  r.post('/complete', async (req, res) => {
    const text = String(req.body?.text ?? '');
    const context = String(req.body?.context ?? '');
    if (!hasAnthropicKey() || text.trim().length < 2) return res.json({ completion: '' });
    try {
      res.json({ completion: await complete(db, text, context) });
    } catch {
      res.json({ completion: '' });
    }
  });

  // ── natural-language logging ─────────────────────────────────────────────
  r.post('/parse-food', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'text required' });
    const slot = typeof req.body?.slot === 'string' ? req.body.slot : undefined;
    try {
      res.json({ items: await parseFood(db, text, slot) });
    } catch (e) {
      aiFail(res, 'parse', e);
    }
  });

  // ── natural-language logging from a photo of her notes ───────────────────
  r.post('/parse-food-photo', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      res.json({ items: await parseFoodPhoto(db, req.file.path, req.file.mimetype, typeof req.body?.slot === 'string' ? req.body.slot : undefined) });
    } catch (e) {
      aiFail(res, 'parse', e);
    }
  });

  // ── chat with Marmalade (multi-turn coaching in the moment) ──────────────
  r.post('/chat', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const date = isDayStr(req.body?.date) ? req.body.date : todayStr();
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const history: ChatTurn[] = raw
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20) // keep the conversation bounded
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
    try {
      res.json({ reply: await marmaladeReply(db, history, date) });
    } catch (e) {
      aiFail(res, 'chat', e);
    }
  });

  // ── end-of-day insights (cached; regenerates only when the day's calories change) ──
  r.get('/day-summary', async (req, res) => {
    const date = (req.query.date as string) || todayStr();
    const total = Math.round((db.prepare('SELECT SUM(kcal) AS k FROM food_log WHERE day_date = ?').get(date) as { k: number | null }).k ?? 0);
    if (total === 0) return res.json({ note: null, reason: 'empty_day' });
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'day_summary'").get() as { value_json: string } | undefined;
    let cached: { date: string; kcal: number; note: string } | null = null;
    if (row) {
      try {
        cached = JSON.parse(row.value_json);
      } catch {
        /* ignore */
      }
    }
    if (cached && cached.date === date && cached.kcal === total) return res.json({ note: cached.note });
    if (!hasAnthropicKey()) return res.json({ note: cached?.date === date ? cached.note : null });
    try {
      const note = await generateDayInsights(db, date);
      if (note) {
        db.prepare(
          "INSERT INTO settings (key,value_json,updated_at) VALUES ('day_summary',?,?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        ).run(JSON.stringify({ date, kcal: total, note }), nowIso());
      }
      res.json({ note });
    } catch {
      res.json({ note: cached?.date === date ? cached.note : null });
    }
  });

  // ── plain-language read of her analytics, in Marmalade's voice (cached per day) ──
  r.get('/analytics-note', async (req, res) => {
    const date = isDayStr(req.query.date) ? req.query.date : todayStr();
    const cached = readBlob<{ date: string; note: string }>(db, 'analytics_note');
    if (cached && cached.date === date) return res.json({ note: cached.note });
    if (!hasAnthropicKey()) return res.json({ note: null });
    try {
      const note = await explainAnalytics(db, date);
      if (note) writeBlob(db, 'analytics_note', { date, note });
      res.json({ note });
    } catch (e) {
      aiFail(res, 'analytics_note', e);
    }
  });

  // ── Marmalade's anomaly check (cached; regenerates only when new food/weight data lands) ──
  r.get('/anomalies', async (req, res) => {
    const date = isDayStr(req.query.date) ? req.query.date : todayStr();
    const loggedDays = (db.prepare('SELECT COUNT(DISTINCT day_date) AS n FROM food_log').get() as { n: number }).n;
    const weighIns = (db.prepare('SELECT COUNT(*) AS n FROM weight_entries').get() as { n: number }).n;
    if (loggedDays < 3 && weighIns < 2) return res.json({ anomalies: [] }); // not enough to notice anything yet
    // fingerprint = newest food + weight rows + the day, so we regenerate exactly when data changes
    const maxFood = (db.prepare('SELECT MAX(id) AS m FROM food_log').get() as { m: number | null }).m ?? 0;
    const maxWeight = (db.prepare('SELECT MAX(id) AS m FROM weight_entries').get() as { m: number | null }).m ?? 0;
    const fingerprint = `${maxFood}:${maxWeight}:${date}`;
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'anomalies'").get() as { value_json: string } | undefined;
    let cached: { fingerprint: string; anomalies: Anomaly[] } | null = null;
    if (row) {
      try {
        cached = JSON.parse(row.value_json);
      } catch {
        /* ignore */
      }
    }
    if (cached && cached.fingerprint === fingerprint) return res.json({ anomalies: cached.anomalies });
    if (!hasAnthropicKey()) return res.json({ anomalies: cached?.anomalies ?? [] });
    try {
      const anomalies = await generateAnomalies(db, date);
      db.prepare(
        "INSERT INTO settings (key,value_json,updated_at) VALUES ('anomalies',?,?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      ).run(JSON.stringify({ fingerprint, anomalies }), nowIso());
      res.json({ anomalies });
    } catch (e) {
      console.warn('[ai] anomalies failed:', e);
      res.json({ anomalies: cached?.anomalies ?? [] });
    }
  });

  // ── recipe importer (paste text OR a web link) ────────────────────────────
  r.post('/parse-recipe', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const text = String(req.body?.text ?? '').trim();
    const url = String(req.body?.url ?? '').trim();
    if (!text && !url) return res.status(400).json({ error: 'text or url required' });
    try {
      res.json({ recipe: url ? await parseRecipeFromUrl(db, url) : await parseRecipe(db, text) });
    } catch (e) {
      aiFail(res, 'parse', e);
    }
  });

  // ── recipe importer (PDF upload) ──────────────────────────────────────────
  r.post('/parse-recipe-pdf', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      res.json({ recipe: await parseRecipePdf(db, req.file.path) });
    } catch (e) {
      aiFail(res, 'parse', e);
    }
  });

  // ── restaurant "build your item" (AI pulls published nutrition once, cached locally) ──
  r.post('/restaurant-item', async (req, res) => {
    const restaurant = titleCase(String(req.body?.restaurant ?? ''));
    const item = String(req.body?.item ?? '').trim();
    if (!restaurant || !item) return res.status(400).json({ error: 'restaurant and item required' });
    const query = item.toLowerCase();
    const cached = db.prepare('SELECT name, components_json, confidence FROM restaurant_menu WHERE restaurant = ? AND query = ?').get(restaurant, query) as
      | { name: string; components_json: string; confidence: string | null }
      | undefined;
    if (cached) return res.json({ item: { name: cached.name, components: JSON.parse(cached.components_json), confidence: cached.confidence ?? undefined }, cached: true });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      const menuNames = (db.prepare('SELECT name FROM restaurant_components WHERE restaurant = ? ORDER BY sort_order, name').all(restaurant) as { name: string }[]).map((r2) => r2.name);
      const parsed = await restaurantItem(db, restaurant, item, menuNames, restaurantHistory(db, restaurant));
      if (parsed) {
        const ts = nowIso();
        db.prepare(
          'INSERT INTO restaurant_menu (restaurant, query, name, components_json, confidence, created_at, updated_at) VALUES (?,?,?,?,?,?,?) ' +
            'ON CONFLICT(restaurant, query) DO UPDATE SET name=excluded.name, components_json=excluded.components_json, confidence=excluded.confidence, updated_at=excluded.updated_at',
        ).run(restaurant, query, parsed.name, JSON.stringify(parsed.components), parsed.confidence ?? null, ts, ts);
        // grow the reusable component library — INSERT OR IGNORE so her edits are never clobbered
        const ins = db.prepare(
          'INSERT OR IGNORE INTO restaurant_components (restaurant,name,category,grams,kcal,protein_g,carb_g,fat_g,default_on,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        );
        let order = 0;
        for (const c of parsed.components) ins.run(restaurant, c.name, c.category, c.grams, c.kcal, c.protein_g, c.carb_g, c.fat_g, c.default_on ? 1 : 0, order++, ts, ts);
      }
      res.json({ item: parsed, cached: false });
    } catch (e) {
      aiFail(res, 'restaurant_item', e);
    }
  });

  // cached orders she's already looked up at a restaurant — instant rebuild, no AI call
  r.get('/restaurant-menu', (req, res) => {
    const restaurant = titleCase(String(req.query.restaurant ?? ''));
    if (!restaurant) return res.json([]);
    const rows = db.prepare('SELECT id, name, query, components_json, confidence FROM restaurant_menu WHERE restaurant = ? ORDER BY updated_at DESC LIMIT 50').all(restaurant) as {
      id: number;
      name: string;
      query: string;
      components_json: string;
      confidence: string | null;
    }[];
    res.json(rows.map((row) => ({ id: row.id, name: row.name, query: row.query, components: JSON.parse(row.components_json), confidence: row.confidence ?? undefined })));
  });

  // pull a restaurant's FULL build-your-own menu (all proteins, salsas, sides…) into the library
  r.post('/restaurant-menu-full', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const restaurant = titleCase(String(req.body?.restaurant ?? ''));
    if (!restaurant) return res.status(400).json({ error: 'restaurant required' });
    try {
      const comps = await restaurantFullMenu(restaurant);
      const ts = nowIso();
      const ins = db.prepare(
        'INSERT OR IGNORE INTO restaurant_components (restaurant,name,category,grams,kcal,protein_g,carb_g,fat_g,default_on,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      );
      let order = 0;
      for (const c of comps) ins.run(restaurant, c.name, c.category, c.grams, c.kcal, c.protein_g, c.carb_g, c.fat_g, c.default_on ? 1 : 0, order++, ts, ts);
      res.json({ components: comps });
    } catch (e) {
      aiFail(res, 'menu', e);
    }
  });

  // same as above but STREAMS the model output (SSE) so the app can show options popping in live
  r.post('/restaurant-menu-full-stream', async (req, res) => {
    const restaurant = titleCase(String(req.body?.restaurant ?? ''));
    if (!restaurant) return res.status(400).json({ error: 'restaurant required' });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      const full = await claudeStream({ system: FULL_MENU_SYSTEM, content: fullMenuContent(restaurant), maxTokens: 6000, timeoutMs: 120_000, onText: (t) => send({ t }) });
      const comps = cleanComponents(salvageObjects(full));
      const ts = nowIso();
      const ins = db.prepare(
        'INSERT OR IGNORE INTO restaurant_components (restaurant,name,category,grams,kcal,protein_g,carb_g,fat_g,default_on,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      );
      let order = 0;
      for (const c of comps) ins.run(restaurant, c.name, c.category, c.grams, c.kcal, c.protein_g, c.carb_g, c.fat_g, c.default_on ? 1 : 0, order++, ts, ts);
      if (comps.length === 0) console.warn(`[ai] menu stream salvaged 0 components for ${restaurant}`);
      send({ done: true, count: comps.length });
    } catch (e) {
      console.warn('[ai] menu stream failed:', e);
      send({ error: 'menu_failed' });
    } finally {
      res.end();
    }
  });

  // ── items-first menu: whole items (each with parts + add-ons), grounded in official web ──
  // GET serves whatever's cached (never triggers AI), so the menu opens instantly.
  r.get('/restaurant-items', (req, res) => {
    const restaurant = titleCase(String(req.query.restaurant ?? ''));
    if (!restaurant) return res.json({ items: [], cached: false });
    const items = loadRestaurantItems(db, restaurant);
    res.json({ items, cached: items.length > 0 });
  });

  // Build/refresh the menu — SSE so the app can narrate "Searching the web… Reading nutrition…".
  r.post('/restaurant-items-stream', async (req, res) => {
    const restaurant = titleCase(String(req.body?.restaurant ?? ''));
    const refresh = !!req.body?.refresh;
    if (!restaurant) return res.status(400).json({ error: 'restaurant required' });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      const out = await getRestaurantMenu(db, restaurant, { refresh, onStatus: (m) => send({ status: m }), onItem: (item) => send({ item }) });
      send({ done: true, ...out });
    } catch (e) {
      console.warn('[ai] restaurant items stream failed:', e);
      send({ error: 'menu_failed' });
    } finally {
      res.end();
    }
  });

  // Build one custom item the user typed (not on the menu) — grounded on the cached nutrition.
  r.post('/restaurant-item-build', async (req, res) => {
    const restaurant = titleCase(String(req.body?.restaurant ?? ''));
    const item = String(req.body?.item ?? '').trim();
    if (!restaurant || !item) return res.status(400).json({ error: 'restaurant and item required' });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      const built = await buildCustomItem(db, restaurant, item);
      res.json({ item: built });
    } catch (e) {
      aiFail(res, 'restaurant_item_build', e);
    }
  });

  // ── weekly check-in (cached ~7 days in the settings table) ───────────────
  r.get('/checkin', async (_req, res) => {
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'checkin'").get() as { value_json: string } | undefined;
    let cached: { note: string; generated_at: string; max_milestone_id?: number } | null = null;
    if (row) {
      try {
        cached = JSON.parse(row.value_json);
      } catch {
        /* ignore */
      }
    }
    // fresh = within 7 days AND no new milestone since — a celebration deserves a new note
    const fresh = cached ? Date.now() - new Date(cached.generated_at).getTime() < 7 * 86_400_000 && cached.max_milestone_id === maxMilestoneId(db) : false;
    if (cached && fresh) return res.json({ note: cached.note });
    if (!hasAnthropicKey()) return res.json({ note: cached?.note ?? null });

    const logged = (db.prepare('SELECT COUNT(DISTINCT day_date) AS n FROM food_log').get() as { n: number }).n;
    const weights = (db.prepare('SELECT COUNT(*) AS n FROM weight_entries').get() as { n: number }).n;
    if (logged < 3 && weights < 3) return res.json({ note: cached?.note ?? null });

    try {
      const note = await generateCheckin(db);
      cacheCheckin(db, note);
      res.json({ note });
    } catch (e) {
      console.warn('[ai] checkin failed:', e);
      res.json({ note: cached?.note ?? null, error: 'checkin_failed' });
    }
  });

  r.post('/checkin/refresh', async (_req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      const note = await generateCheckin(db);
      cacheCheckin(db, note);
      res.json({ note });
    } catch (e) {
      aiFail(res, 'checkin', e);
    }
  });

  // ── meal plan: saved, editable, with lock-and-regenerate ─────────────────
  r.get('/meal-plan', (_req, res) => {
    res.json({ plan: readBlob<StoredPlan>(db, 'meal_plan') });
  });

  r.post('/meal-plan', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const days = Math.max(1, Math.min(7, Number(req.body?.days) || 3));
    const guidance = typeof req.body?.guidance === 'string' ? req.body.guidance : '';
    // keep = the locked meals from the saved plan whose ids the client sent
    const keepIds: string[] = Array.isArray(req.body?.keepIds) ? req.body.keepIds : [];
    const saved = readBlob<StoredPlan>(db, 'meal_plan');
    const keep: KeptMeal[] = [];
    if (saved && keepIds.length) {
      saved.days.forEach((d, dayIndex) => {
        for (const m of d.meals) if (keepIds.includes(m.id)) keep.push({ dayIndex, meal: { ...m, locked: true } });
      });
    }
    try {
      const plan = await generateMealPlan(db, { days, guidance, keep });
      if (plan) writeBlob(db, 'meal_plan', plan);
      res.json({ plan });
    } catch (e) {
      aiFail(res, 'plan', e);
    }
  });

  // streamed generation — meals pop in as the model writes them (SSE), then we persist the final plan
  r.post('/meal-plan-stream', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const days = Math.max(1, Math.min(7, Number(req.body?.days) || 3));
    const guidance = typeof req.body?.guidance === 'string' ? req.body.guidance : '';
    const keepIds: string[] = Array.isArray(req.body?.keepIds) ? req.body.keepIds : [];
    const date = isDayStr(req.body?.date) ? req.body.date : todayStr();
    const saved = readBlob<StoredPlan>(db, 'meal_plan');
    const keep: KeptMeal[] = [];
    if (saved && keepIds.length) {
      saved.days.forEach((d, dayIndex) => {
        for (const m of d.meals) if (keepIds.includes(m.id)) keep.push({ dayIndex, meal: { ...m, locked: true } });
      });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      const full = await claudeStream({ system: MEALPLAN_SYSTEM, content: buildMealPlanContent(db, { days, guidance, keep, date }), maxTokens: 8000, timeoutMs: 120_000, onText: (t) => send({ t }) });
      const parsed = MealPlanSchema.safeParse(extractJson(full));
      if (!parsed.success) {
        console.warn('[ai] meal-plan stream failed validation:', parsed.error.issues.slice(0, 3));
        send({ error: 'plan_failed' });
      } else {
        const plan = assembleStored(parsed.data.days, { days, guidance, keep, date });
        writeBlob(db, 'meal_plan', plan);
        send({ done: true, plan });
      }
    } catch (e) {
      console.warn('[ai] meal-plan stream failed:', e);
      send({ error: 'plan_failed' });
    } finally {
      res.end();
    }
  });

  // save a client-edited plan (lock toggles, add/remove/edit a meal) — the blob is the source of truth
  r.put('/meal-plan', (req, res) => {
    const plan = req.body?.plan;
    if (!plan || !Array.isArray(plan.days)) return res.status(400).json({ error: 'plan required' });
    writeBlob(db, 'meal_plan', plan);
    res.json({ plan });
  });

  // ── weekly goals (smart + manual checklist) ──────────────────────────────
  r.get('/weekly-goals', (req, res) => {
    res.json({ items: getWeeklyGoals(db, isDayStr(req.query.date) ? req.query.date : todayStr()) });
  });
  r.put('/weekly-goals', (req, res) => {
    const date = isDayStr(req.body?.date) ? req.body.date : todayStr();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    res.json({ items: saveWeeklyGoals(db, date, items) });
  });
  r.post('/weekly-goals/suggest', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const date = isDayStr(req.body?.date) ? req.body.date : todayStr();
    try {
      res.json({ items: await suggestWeeklyGoals(db, date) });
    } catch (e) {
      aiFail(res, 'goals', e);
    }
  });

  return r;
}
