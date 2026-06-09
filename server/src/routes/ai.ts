import { Router } from 'express';
import { generateCheckin, generateMealPlan } from '../ai/coach';
import { extractLabel } from '../ai/extractLabel';
import { parseFood } from '../ai/parseFood';
import { parseRecipe } from '../ai/parseRecipe';
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
