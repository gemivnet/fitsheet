// off.ts — Open Food Facts client (free, no key). Normalizes products to fitsheet's food shape.
// The server proxies OFF so the app never deals with CORS/keys.

export interface OffFood {
  name: string;
  brand: string | null;
  barcode: string | null;
  off_id: string | null;
  serving_g: number | null;
  serving_label: string | null;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
}

const UA = 'fitsheet/0.1 (personal home-lab app)';
const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

function mapProduct(p: any): OffFood | null {
  const n = p?.nutriments ?? {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : undefined);
  if (kcal == null) return null;
  const brand = Array.isArray(p.brands) ? p.brands.join(', ') : p.brands || null;
  return {
    name: p.product_name || p.generic_name || 'Unknown product',
    brand,
    barcode: p.code || null,
    off_id: p.code || null,
    serving_g: typeof p.serving_quantity === 'number' ? p.serving_quantity : Number(p.serving_quantity) || null,
    serving_label: p.serving_size || null,
    kcal_100g: Math.round(num(kcal)),
    protein_100g: num(n.proteins_100g),
    carb_100g: num(n.carbohydrates_100g),
    fat_100g: num(n.fat_100g),
  };
}

export async function offBarcode(code: string): Promise<OffFood | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) {
    console.warn(`[off] barcode lookup failed: ${r.status}`);
    return null;
  }
  const j: any = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return mapProduct(j.product);
}

export async function offSearch(q: string, limit = 20): Promise<OffFood[]> {
  // Search-a-licious (the legacy cgi/search.pl now returns HTML to bots).
  const url =
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${limit}` +
    `&fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) {
    console.warn(`[off] search failed: ${r.status}`);
    return [];
  }
  const j: any = await r.json();
  const hits: any[] = Array.isArray(j.hits) ? j.hits : [];
  return hits.map(mapProduct).filter((x): x is OffFood => x !== null && !!x.name && x.kcal_100g > 0);
}
