// restaurantNutrition.ts — items-first restaurant menus grounded in OFFICIAL web nutrition.
// Two stages: (1) research — Claude web_search + web_fetch the brand's official nutrition (PDF/page),
// cached per restaurant in a settings blob; (2) structure — turn that digest into menu ITEMS (each
// with its parts + add-ons) via the structured-output path, persisted in restaurant_items so the
// menu loads instantly afterwards. No official source found → falls back to estimated.

import { claudeResearch } from './client';
import { runTask } from './task';
import { RestaurantMenuItemSchema, RestaurantMenuSchema } from './schemas';
import { stripRestaurantPrefix } from '../util';
import { nowIso } from '../util';
import type { DB } from '../db/index';

export interface ItemModifier {
  name: string;
  kind: 'part' | 'addon';
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  default_on: boolean;
}
export interface RestaurantMenuItem {
  id?: number;
  name: string;
  category: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  modifiers: ItemModifier[];
  confidence: 'official' | 'published' | 'estimated';
  source_url?: string | null;
}

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const slug = (s: string): string => s.trim().toLowerCase();
const blobKey = (r: string): string => `restaurant_nutrition:${slug(r)}`;

interface NutritionDigest {
  digest: string;
  sourceUrls: string[];
  found: boolean;
  fetched_at: string;
}

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

const RESEARCH_SYSTEM =
  "You research a restaurant's OFFICIAL nutrition so meals can be logged accurately.\n" +
  'Use web_search to find the brand\'s own official nutrition source (prefer their official nutrition PDF or nutrition page on the brand\'s domain; avoid third-party calorie sites), then web_fetch it.\n' +
  'Then write a compact digest of the POPULAR menu ITEMS using ONLY the published numbers you fetched. ' +
  'For each item: the item name as it reads on the menu (no brand prefix), a category, serving grams, calories, and protein/carb/fat grams. ' +
  'When an item is composed or build-your-own, also list its standard PARTS and common ADD-ONS, each with its own numbers.\n' +
  'Never invent numbers. Format your reply EXACTLY as:\n' +
  'FOUND: yes|no\n' +
  'SOURCES: <url>, <url>\n' +
  '<then the readable item digest>';

/** Stage 1 — cached web research for a restaurant's official nutrition. */
export async function getOfficialNutrition(db: DB, restaurant: string, opts: { refresh?: boolean } = {}): Promise<NutritionDigest> {
  const key = blobKey(restaurant);
  const cached = readBlob<NutritionDigest>(db, key);
  if (cached && !opts.refresh && (cached.found || Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS)) {
    return cached;
  }
  let res: { text: string; sourceUrls: string[] };
  try {
    res = await claudeResearch({ system: RESEARCH_SYSTEM, content: `Restaurant: ${restaurant}`, maxTokens: 5000, timeoutMs: 150_000 });
  } catch (e) {
    console.warn('[ai] restaurant nutrition research failed', e);
    return { digest: '', sourceUrls: [], found: false, fetched_at: nowIso() };
  }
  const found = /FOUND:\s*yes/i.test(res.text);
  const srcLine = /SOURCES:\s*(.+)/i.exec(res.text)?.[1] ?? '';
  const lineUrls = srcLine.match(/https?:\/\/[^\s,"'<>)\]]+/g) ?? [];
  const sourceUrls = [...new Set([...lineUrls, ...res.sourceUrls])].slice(0, 6);
  const out: NutritionDigest = { digest: res.text, sourceUrls, found, fetched_at: nowIso() };
  writeBlob(db, key, out);
  return out;
}

const MENU_SYSTEM =
  'You build a restaurant menu as a list of whole ITEMS the user can order, so they can pick item(s) and customize each.\n' +
  'For FIXED-MENU chains (McDonald\'s, Wendy\'s, Chick-fil-A, etc.): each item is a complete menu item (e.g. "Big Mac", "Medium Fries"). ' +
  'Give it base nutrition, and list its swappable PARTS (kind:"part", default_on:true — e.g. bun, patty, cheese, sauce) and common ADD-ONS (kind:"addon", default_on:false — e.g. add bacon, extra cheese), each with ITS OWN nutrition delta.\n' +
  'For BUILD-YOUR-OWN chains (Chipotle, Subway, Cava): each item is the buildable (e.g. "Burrito Bowl", "Salad"); list the components (rice, protein, beans, toppings, salsas) as modifiers — common ones default_on:true, extras default_on:false.\n' +
  "The item's base kcal/macros should equal the sum of its default_on parts. " +
  'Name items and modifiers as they read on the menu, WITHOUT the brand in front. ' +
  'Set each item\'s "confidence" to "official" ONLY when its numbers come from the official source provided; otherwise "estimated". ' +
  'Be reasonably complete for the popular options.';

function cleanItem(raw: any, restaurant: string, grounded: boolean, sourceUrl: string | null): RestaurantMenuItem {
  const n = (v: any) => Math.max(0, Math.round(Number(v) || 0));
  const mods: ItemModifier[] = (Array.isArray(raw.modifiers) ? raw.modifiers : [])
    .filter((m: any) => m && m.name)
    .map((m: any) => ({
      name: stripRestaurantPrefix(String(m.name), restaurant),
      kind: m.kind === 'addon' ? 'addon' : 'part',
      grams: n(m.grams),
      kcal: n(m.kcal),
      protein_g: n(m.protein_g),
      carb_g: n(m.carb_g),
      fat_g: n(m.fat_g),
      default_on: m.default_on !== false,
    }));
  const conf: RestaurantMenuItem['confidence'] = grounded && raw.confidence === 'official' ? 'official' : raw.confidence === 'published' ? 'published' : 'estimated';
  return {
    name: stripRestaurantPrefix(String(raw.name), restaurant),
    category: String(raw.category || 'other').toLowerCase(),
    grams: n(raw.grams),
    kcal: n(raw.kcal),
    protein_g: n(raw.protein_g),
    carb_g: n(raw.carb_g),
    fat_g: n(raw.fat_g),
    modifiers: mods,
    confidence: conf,
    source_url: conf === 'official' ? sourceUrl : null,
  };
}

function persistItems(db: DB, restaurant: string, items: RestaurantMenuItem[]): void {
  const now = nowIso();
  const stmt = db.prepare(
    'INSERT INTO restaurant_items (restaurant,name,category,grams,kcal,protein_g,carb_g,fat_g,modifiers_json,confidence,source_url,sort_order,created_at,updated_at) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ' +
      'ON CONFLICT(restaurant,name) DO UPDATE SET category=excluded.category, grams=excluded.grams, kcal=excluded.kcal, protein_g=excluded.protein_g, ' +
      'carb_g=excluded.carb_g, fat_g=excluded.fat_g, modifiers_json=excluded.modifiers_json, confidence=excluded.confidence, source_url=excluded.source_url, ' +
      'sort_order=excluded.sort_order, updated_at=excluded.updated_at',
  );
  items.forEach((it, i) =>
    stmt.run(restaurant, it.name, it.category, it.grams, it.kcal, it.protein_g, it.carb_g, it.fat_g, JSON.stringify(it.modifiers), it.confidence, it.source_url ?? null, i, now, now),
  );
}

export function loadRestaurantItems(db: DB, restaurant: string): RestaurantMenuItem[] {
  const rows = db.prepare('SELECT * FROM restaurant_items WHERE restaurant = ? ORDER BY sort_order, name').all(restaurant) as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    grams: r.grams,
    kcal: r.kcal,
    protein_g: r.protein_g,
    carb_g: r.carb_g,
    fat_g: r.fat_g,
    modifiers: safeJson<ItemModifier[]>(r.modifiers_json, []),
    confidence: r.confidence,
    source_url: r.source_url,
  }));
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/**
 * Stage 2 — get the structured, persisted menu for a restaurant. Reuses the cached research +
 * persisted items; only calls the model when there's nothing yet (or refresh). `onStatus` lets the
 * streaming route narrate progress.
 */
export async function getRestaurantMenu(
  db: DB,
  restaurant: string,
  opts: { refresh?: boolean; onStatus?: (m: string) => void } = {},
): Promise<{ items: RestaurantMenuItem[]; sourceUrls: string[]; found: boolean }> {
  const existing = loadRestaurantItems(db, restaurant);
  if (existing.length && !opts.refresh) {
    const nut = readBlob<NutritionDigest>(db, blobKey(restaurant));
    return { items: existing, sourceUrls: nut?.sourceUrls ?? [], found: !!nut?.found };
  }
  opts.onStatus?.('Searching the web for official nutrition…');
  const nut = await getOfficialNutrition(db, restaurant, { refresh: opts.refresh });
  opts.onStatus?.(nut.found ? 'Reading the official nutrition…' : 'No official source — estimating…');
  const grounding = nut.found
    ? `Official nutrition pulled from ${nut.sourceUrls.join(', ')}:\n${nut.digest}\n\nUse these EXACT published numbers; set confidence "official" for items covered by it, "estimated" for any you had to fill in.`
    : 'No official source was found — give realistic ESTIMATED nutrition for the popular items and set every confidence to "estimated".';
  const parsed = await runTask(
    db,
    { name: 'restaurant-menu', schema: RestaurantMenuSchema, system: MENU_SYSTEM, maxTokens: 8000 },
    { content: `Restaurant: ${restaurant}\n\n${grounding}` },
  );
  const items = (parsed?.items ?? []).map((it) => cleanItem(it, restaurant, nut.found, nut.sourceUrls[0] ?? null)).filter((it) => it.name && it.kcal >= 0);
  if (items.length) persistItems(db, restaurant, items);
  opts.onStatus?.(`Found ${items.length} items.`);
  return { items: loadRestaurantItems(db, restaurant), sourceUrls: nut.sourceUrls, found: nut.found };
}

const ITEM_BUILD_SYSTEM =
  'Build ONE restaurant menu item the user describes, as an item with its parts + add-ons (modifiers). ' +
  'List the item\'s standard PARTS (kind:"part", default_on:true) and common ADD-ONS (kind:"addon", default_on:false), each with its own nutrition. ' +
  'Reflect any customization in the request (e.g. "no pickles" → that part default_on:false; "add bacon" → that add-on default_on:true). ' +
  'The base kcal/macros should equal the sum of default_on parts. Name the item and modifiers without the brand prefix. ' +
  'Use official published numbers when the provided source covers it (confidence "official"); otherwise estimate realistically (confidence "estimated").';

/** Build a single custom item (free text) grounded on the cached digest — no new web search. */
export async function buildCustomItem(db: DB, restaurant: string, itemText: string): Promise<RestaurantMenuItem | null> {
  const nut = readBlob<NutritionDigest>(db, blobKey(restaurant));
  const grounding = nut?.found ? `Official nutrition for ${restaurant} (use exact numbers where the item matches):\n${nut.digest}` : '';
  const parsed = await runTask(
    db,
    { name: 'restaurant-item-build', schema: RestaurantMenuItemSchema, system: ITEM_BUILD_SYSTEM, maxTokens: 1500 },
    { content: `Restaurant: ${restaurant}\nItem: ${itemText}\n\n${grounding}` },
  );
  if (!parsed || !parsed.name) return null;
  return cleanItem(parsed, restaurant, !!nut?.found, nut?.sourceUrls[0] ?? null);
}
