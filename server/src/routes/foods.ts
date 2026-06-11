import { Router } from 'express';
import { writeAudit } from '../audit';
import type { DB } from '../db/index';
import { nowIso } from '../util';

const ALLOWED = ['name', 'brand', 'barcode', 'source', 'off_id', 'serving_g', 'serving_label', 'unit_name', 'restaurant', 'eating_out', 'kcal_100g', 'protein_100g', 'carb_100g', 'fat_100g', 'label_photo', 'is_favorite', 'pref_unit_mode', 'last_grams'] as const;
const FLAGS = new Set(['is_favorite', 'eating_out']);

export function foodsRouter(db: DB): Router {
  const r = Router();

  r.get('/', (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const restaurant = (req.query.restaurant as string | undefined)?.trim();
    if (q) {
      res.json(db.prepare('SELECT * FROM foods WHERE name LIKE ? ORDER BY is_favorite DESC, updated_at DESC LIMIT 100').all(`%${q}%`));
    } else if (restaurant) {
      res.json(db.prepare('SELECT * FROM foods WHERE restaurant = ? ORDER BY updated_at DESC LIMIT 100').all(restaurant));
    } else if (req.query.eating_out === '1') {
      res.json(db.prepare('SELECT * FROM foods WHERE eating_out = 1 ORDER BY updated_at DESC LIMIT 100').all());
    } else if (req.query.favorite === '1') {
      res.json(db.prepare('SELECT * FROM foods WHERE is_favorite = 1 ORDER BY updated_at DESC LIMIT 100').all());
    } else {
      res.json(db.prepare('SELECT * FROM foods ORDER BY is_favorite DESC, updated_at DESC LIMIT 100').all());
    }
  });

  // distinct restaurants she's saved orders for (most-used first)
  r.get('/restaurants', (_req, res) => {
    res.json(db.prepare("SELECT restaurant, COUNT(*) AS count FROM foods WHERE restaurant IS NOT NULL AND restaurant != '' GROUP BY restaurant ORDER BY count DESC, restaurant").all());
  });

  // Smart "My foods" ordering: what she's most likely to add right now. Blends frequency,
  // recency, the current meal slot ("breakfast foods"), favorites, and — the clever bit —
  // what she usually logs *after* the food she just logged today (grits → brown sugar).
  r.get('/suggestions', (req, res) => {
    const slot = (req.query.slot as string | undefined) ?? '';
    const date = (req.query.date as string | undefined) ?? '';

    const foods = db.prepare('SELECT * FROM foods ORDER BY updated_at DESC LIMIT 200').all() as Record<string, any>[];
    if (!foods.length) return res.json([]);

    // per-food logging stats
    const stats = db
      .prepare(
        'SELECT food_id, COUNT(*) AS total, MAX(created_at) AS last_at, ' +
          'SUM(CASE WHEN meal_slot = ? THEN 1 ELSE 0 END) AS slot_count ' +
          'FROM food_log WHERE food_id IS NOT NULL GROUP BY food_id',
      )
      .all(slot) as { food_id: number; total: number; last_at: string; slot_count: number }[];
    const stat = new Map(stats.map((s) => [s.food_id, s]));

    // Food × time-of-day correlation: how often each food is logged within ±2h of *now*
    // (everything in UTC, so it's internally consistent and stores no timezone). This sharpens
    // "what I usually eat around this time" beyond the coarse meal-slot signal.
    const nowHour = new Date().getUTCHours();
    const hourRows = db
      .prepare(
        "SELECT food_id, COUNT(*) AS near FROM food_log WHERE food_id IS NOT NULL AND " +
          "MIN((24 + CAST(strftime('%H', created_at) AS INTEGER) - ?) % 24, (24 + ? - CAST(strftime('%H', created_at) AS INTEGER)) % 24) <= 2 " +
          "GROUP BY food_id",
      )
      .all(nowHour, nowHour) as { food_id: number; near: number }[];
    const hourNear = new Map(hourRows.map((h) => [h.food_id, h.near]));

    // the food she logged most recently (today) anchors the "what comes next" suggestion —
    // count only the IMMEDIATE next item after it on each past day (grits → brown sugar).
    const anchorRow = date
      ? (db
          .prepare("SELECT food_id FROM food_log WHERE food_id IS NOT NULL AND day_date = ? ORDER BY created_at DESC, id DESC LIMIT 1")
          .get(date) as { food_id: number } | undefined)
      : undefined;
    const anchorName = anchorRow?.food_id != null ? (db.prepare('SELECT name FROM foods WHERE id = ?').get(anchorRow.food_id) as { name: string } | undefined)?.name : undefined;
    const seq = new Map<number, number>();
    if (anchorRow?.food_id != null) {
      const rows = db
        .prepare(
          'SELECT b.food_id AS fid, COUNT(*) AS n FROM food_log a ' +
            'JOIN food_log b ON b.id = (' +
            '  SELECT c.id FROM food_log c WHERE c.day_date = a.day_date AND c.created_at > a.created_at ' +
            '  AND c.food_id IS NOT NULL AND c.food_id != a.food_id ORDER BY c.created_at, c.id LIMIT 1) ' +
            'WHERE a.food_id = ? GROUP BY b.food_id',
        )
        .all(anchorRow.food_id) as { fid: number; n: number }[];
      for (const row of rows) seq.set(row.fid, row.n);
    }

    const slotLabel = slot ? slot.charAt(0).toUpperCase() + slot.slice(1) : '';
    const now = Date.now();
    const scored = foods.map((f) => {
      const s = stat.get(f.id);
      const days = s?.last_at ? Math.max(0, (now - Date.parse(s.last_at)) / 86_400_000) : 999;
      const c = {
        seq: (seq.get(f.id) ?? 0) * 6.0, // "I always add this right after the last thing"
        hour: Math.min(hourNear.get(f.id) ?? 0, 10) * 2.5, // logged around this time of day
        slot: (s?.slot_count ?? 0) * 3.0, // this meal slot
        recency: s ? 12 * Math.exp(-days / 10) : 0,
        freq: s ? Math.min(s.total, 20) * 1.0 : 0,
        fav: f.is_favorite ? 2.0 : 0,
      };
      const score = c.seq + c.hour + c.slot + c.recency + c.freq + c.fav;
      // pick the dominant signal for a short human reason
      const ranked = [
        { v: c.seq, why: anchorName ? `after ${anchorName}` : undefined },
        { v: c.hour, why: 'you usually have this now' },
        { v: c.slot, why: slotLabel ? `often at ${slotLabel.toLowerCase()}` : undefined },
        { v: c.recency, why: days <= 2 ? 'recent' : undefined },
        { v: c.fav, why: f.is_favorite ? 'favorite' : undefined },
      ].sort((a, b) => b.v - a.v);
      const reason = ranked[0].v > 0 ? ranked[0].why : undefined;
      return { f, reason, score };
    });
    scored.sort((a, b) => b.score - a.score || Date.parse(b.f.updated_at) - Date.parse(a.f.updated_at));
    res.json(scored.slice(0, 40).map((x) => ({ ...x.f, reason: x.reason })));
  });

  r.get('/barcode/:code', (req, res) => {
    const row = db.prepare('SELECT * FROM foods WHERE barcode = ? ORDER BY updated_at DESC LIMIT 1').get(req.params.code);
    if (!row) return res.status(404).json({ error: 'not_found' });
    res.json(row);
  });

  r.post('/', (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!b.name || b.kcal_100g == null) return res.status(400).json({ error: 'name and kcal_100g required' });
    const ts = nowIso();
    const info = db
      .prepare(
        'INSERT INTO foods (name,brand,barcode,source,off_id,serving_g,serving_label,unit_name,restaurant,eating_out,kcal_100g,protein_100g,carb_100g,fat_100g,label_photo,is_favorite,created_at,updated_at) ' +
          'VALUES (@name,@brand,@barcode,@source,@off_id,@serving_g,@serving_label,@unit_name,@restaurant,@eating_out,@kcal_100g,@protein_100g,@carb_100g,@fat_100g,@label_photo,@is_favorite,@created_at,@updated_at)',
      )
      .run({
        name: b.name,
        brand: b.brand ?? null,
        barcode: b.barcode ?? null,
        source: b.source ?? 'custom',
        off_id: b.off_id ?? null,
        serving_g: b.serving_g ?? null,
        serving_label: b.serving_label ?? null,
        unit_name: b.unit_name ?? null,
        restaurant: b.restaurant ?? null,
        eating_out: b.eating_out ? 1 : 0,
        kcal_100g: b.kcal_100g ?? 0,
        protein_100g: b.protein_100g ?? 0,
        carb_100g: b.carb_100g ?? 0,
        fat_100g: b.fat_100g ?? 0,
        label_photo: b.label_photo ?? null,
        is_favorite: b.is_favorite ? 1 : 0,
        created_at: ts,
        updated_at: ts,
      });
    const id = Number(info.lastInsertRowid);
    writeAudit(db, { entity: 'food', entityId: id, action: 'create' });
    res.json(db.prepare('SELECT * FROM foods WHERE id = ?').get(id));
  });

  r.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM foods WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...existing };
    for (const k of ALLOWED) if (k in b) next[k] = FLAGS.has(k) ? (b[k] ? 1 : 0) : b[k];
    next.updated_at = nowIso();
    db.prepare(
      'UPDATE foods SET name=@name,brand=@brand,barcode=@barcode,source=@source,off_id=@off_id,serving_g=@serving_g,serving_label=@serving_label,unit_name=@unit_name,restaurant=@restaurant,eating_out=@eating_out,kcal_100g=@kcal_100g,protein_100g=@protein_100g,carb_100g=@carb_100g,fat_100g=@fat_100g,label_photo=@label_photo,is_favorite=@is_favorite,updated_at=@updated_at WHERE id=@id',
    ).run({ ...next, id });
    writeAudit(db, { entity: 'food', entityId: id, action: 'update' });
    res.json(db.prepare('SELECT * FROM foods WHERE id = ?').get(id));
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM foods WHERE id = ?').run(id);
    writeAudit(db, { entity: 'food', entityId: id, action: 'delete' });
    res.json({ ok: true });
  });

  return r;
}
