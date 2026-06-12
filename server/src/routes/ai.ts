import { Router } from 'express';
import { generateCheckin, generateMealPlan } from '../ai/coach';
import { extractLabel } from '../ai/extractLabel';
import { parseFood } from '../ai/parseFood';
import { parseFoodPhoto } from '../ai/parseFoodPhoto';
import { parseRecipe } from '../ai/parseRecipe';
import { personalFoodsHint, restaurantHistory } from '../ai/personalContext';
import { claudeStream } from '../ai/client';
import { complete } from '../ai/complete';
import { cleanComponents, FULL_MENU_SYSTEM, fullMenuContent, restaurantFullMenu, restaurantItem, salvageObjects } from '../ai/restaurantItem';
import { hasAnthropicKey } from '../config';
import type { DB } from '../db/index';
import { upload } from '../upload';
import { nowIso, titleCase } from '../util';

const NO_KEY = { error: 'no_api_key' };

function cacheCheckin(db: DB, note: string): void {
  db.prepare(
    "INSERT INTO settings (key,value_json,updated_at) VALUES ('checkin',?,?) " +
      'ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at',
  ).run(JSON.stringify({ note, generated_at: nowIso() }), nowIso());
}

export function aiRouter(db: DB): Router {
  const r = Router();

  // ── nutrition label → custom food (photo always saved) ──────────────────
  r.post('/extract-label', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    if (!hasAnthropicKey()) return res.status(503).json({ error: 'no_api_key', label_photo: req.file.filename, nutrition: null });
    try {
      const nutrition = await extractLabel(req.file.path, req.file.mimetype);
      res.json({ nutrition, label_photo: req.file.filename, confidence: nutrition?.confidence ?? 'low' });
    } catch (e) {
      res.status(502).json({ error: 'extract_failed', label_photo: req.file.filename, nutrition: null, detail: String(e) });
    }
  });

  // ── inline autocomplete (ghost text); always 200, empty when off/unsure ──
  r.post('/complete', async (req, res) => {
    const text = String(req.body?.text ?? '');
    const context = String(req.body?.context ?? '');
    if (!hasAnthropicKey() || text.trim().length < 2) return res.json({ completion: '' });
    try {
      res.json({ completion: await complete(text, context) });
    } catch {
      res.json({ completion: '' });
    }
  });

  // ── natural-language logging ─────────────────────────────────────────────
  r.post('/parse-food', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'text required' });
    try {
      res.json({ items: await parseFood(text, personalFoodsHint(db)) });
    } catch (e) {
      res.status(502).json({ error: 'parse_failed', detail: String(e) });
    }
  });

  // ── natural-language logging from a photo of her notes ───────────────────
  r.post('/parse-food-photo', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      res.json({ items: await parseFoodPhoto(req.file.path, req.file.mimetype) });
    } catch (e) {
      res.status(502).json({ error: 'parse_failed', detail: String(e) });
    }
  });

  // ── recipe importer ──────────────────────────────────────────────────────
  r.post('/parse-recipe', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'text required' });
    try {
      res.json({ recipe: await parseRecipe(text) });
    } catch (e) {
      res.status(502).json({ error: 'parse_failed', detail: String(e) });
    }
  });

  // ── restaurant "build your item" (AI pulls published nutrition once, cached locally) ──
  r.post('/restaurant-item', async (req, res) => {
    const restaurant = titleCase(String(req.body?.restaurant ?? ''));
    const item = String(req.body?.item ?? '').trim();
    if (!restaurant || !item) return res.status(400).json({ error: 'restaurant and item required' });
    const query = item.toLowerCase();
    const cached = db.prepare('SELECT name, components_json FROM restaurant_menu WHERE restaurant = ? AND query = ?').get(restaurant, query) as
      | { name: string; components_json: string }
      | undefined;
    if (cached) return res.json({ item: { name: cached.name, components: JSON.parse(cached.components_json) }, cached: true });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      const menuNames = (db.prepare('SELECT name FROM restaurant_components WHERE restaurant = ? ORDER BY sort_order, name').all(restaurant) as { name: string }[]).map((r2) => r2.name);
      const parsed = await restaurantItem(restaurant, item, menuNames, restaurantHistory(db, restaurant));
      if (parsed) {
        const ts = nowIso();
        db.prepare(
          'INSERT INTO restaurant_menu (restaurant, query, name, components_json, created_at, updated_at) VALUES (?,?,?,?,?,?) ' +
            'ON CONFLICT(restaurant, query) DO UPDATE SET name=excluded.name, components_json=excluded.components_json, updated_at=excluded.updated_at',
        ).run(restaurant, query, parsed.name, JSON.stringify(parsed.components), ts, ts);
        // grow the reusable component library — INSERT OR IGNORE so her edits are never clobbered
        const ins = db.prepare(
          'INSERT OR IGNORE INTO restaurant_components (restaurant,name,category,grams,kcal,protein_g,carb_g,fat_g,default_on,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        );
        let order = 0;
        for (const c of parsed.components) ins.run(restaurant, c.name, c.category, c.grams, c.kcal, c.protein_g, c.carb_g, c.fat_g, c.default_on ? 1 : 0, order++, ts, ts);
      }
      res.json({ item: parsed, cached: false });
    } catch (e) {
      res.status(502).json({ error: 'failed', detail: String(e) });
    }
  });

  // cached orders she's already looked up at a restaurant — instant rebuild, no AI call
  r.get('/restaurant-menu', (req, res) => {
    const restaurant = titleCase(String(req.query.restaurant ?? ''));
    if (!restaurant) return res.json([]);
    const rows = db.prepare('SELECT id, name, query, components_json FROM restaurant_menu WHERE restaurant = ? ORDER BY updated_at DESC LIMIT 50').all(restaurant) as {
      id: number;
      name: string;
      query: string;
      components_json: string;
    }[];
    res.json(rows.map((row) => ({ id: row.id, name: row.name, query: row.query, components: JSON.parse(row.components_json) })));
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
      res.status(502).json({ error: 'failed', detail: String(e) });
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
      const full = await claudeStream({ system: FULL_MENU_SYSTEM, content: fullMenuContent(restaurant), maxTokens: 6000, onText: (t) => send({ t }) });
      const comps = cleanComponents(salvageObjects(full));
      const ts = nowIso();
      const ins = db.prepare(
        'INSERT OR IGNORE INTO restaurant_components (restaurant,name,category,grams,kcal,protein_g,carb_g,fat_g,default_on,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      );
      let order = 0;
      for (const c of comps) ins.run(restaurant, c.name, c.category, c.grams, c.kcal, c.protein_g, c.carb_g, c.fat_g, c.default_on ? 1 : 0, order++, ts, ts);
      send({ done: true, count: comps.length });
    } catch (e) {
      send({ error: String(e) });
    } finally {
      res.end();
    }
  });

  // ── weekly check-in (cached ~7 days in the settings table) ───────────────
  r.get('/checkin', async (_req, res) => {
    const row = db.prepare("SELECT value_json FROM settings WHERE key = 'checkin'").get() as { value_json: string } | undefined;
    let cached: { note: string; generated_at: string } | null = null;
    if (row) {
      try {
        cached = JSON.parse(row.value_json);
      } catch {
        /* ignore */
      }
    }
    const fresh = cached ? Date.now() - new Date(cached.generated_at).getTime() < 7 * 86_400_000 : false;
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
      res.json({ note: cached?.note ?? null, error: String(e) });
    }
  });

  r.post('/checkin/refresh', async (_req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      const note = await generateCheckin(db);
      cacheCheckin(db, note);
      res.json({ note });
    } catch (e) {
      res.status(502).json({ error: 'failed', detail: String(e) });
    }
  });

  // ── meal plan that fits the calorie goal ─────────────────────────────────
  r.post('/meal-plan', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const days = Math.max(1, Math.min(7, Number(req.body?.days) || 3));
    try {
      res.json({ plan: await generateMealPlan(db, days) });
    } catch (e) {
      res.status(502).json({ error: 'plan_failed', detail: String(e) });
    }
  });

  return r;
}
