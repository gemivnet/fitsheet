import { Router } from 'express';
import { generateCheckin, generateMealPlan } from '../ai/coach';
import { extractLabel } from '../ai/extractLabel';
import { parseFood } from '../ai/parseFood';
import { parseRecipe } from '../ai/parseRecipe';
import { restaurantItem } from '../ai/restaurantItem';
import { hasAnthropicKey } from '../config';
import type { DB } from '../db/index';
import { upload } from '../upload';
import { nowIso } from '../util';

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

  // ── natural-language logging ─────────────────────────────────────────────
  r.post('/parse-food', async (req, res) => {
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'text required' });
    try {
      res.json({ items: await parseFood(text) });
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
    const restaurant = String(req.body?.restaurant ?? '').trim();
    const item = String(req.body?.item ?? '').trim();
    if (!restaurant || !item) return res.status(400).json({ error: 'restaurant and item required' });
    const query = item.toLowerCase();
    const cached = db.prepare('SELECT name, components_json FROM restaurant_menu WHERE restaurant = ? AND query = ?').get(restaurant, query) as
      | { name: string; components_json: string }
      | undefined;
    if (cached) return res.json({ item: { name: cached.name, components: JSON.parse(cached.components_json) }, cached: true });
    if (!hasAnthropicKey()) return res.status(503).json(NO_KEY);
    try {
      const parsed = await restaurantItem(restaurant, item);
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
    const restaurant = String(req.query.restaurant ?? '').trim();
    if (!restaurant) return res.json([]);
    const rows = db.prepare('SELECT id, name, query, components_json FROM restaurant_menu WHERE restaurant = ? ORDER BY updated_at DESC LIMIT 50').all(restaurant) as {
      id: number;
      name: string;
      query: string;
      components_json: string;
    }[];
    res.json(rows.map((row) => ({ id: row.id, name: row.name, query: row.query, components: JSON.parse(row.components_json) })));
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
