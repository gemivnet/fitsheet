// api.ts — the single typed client for the fitsheet server. Every screen imports from here.
// Base URL comes from EXPO_PUBLIC_API_URL (defaults to localhost for the simulator).

// On the web build the server serves the app + API on the SAME origin, so we use a relative
// base ('') — that works over http or https and behind any hostname (Nginx Proxy Manager, etc.),
// with no mixed-content issues. A native build (or an explicit override) uses EXPO_PUBLIC_API_URL.
import { Platform } from 'react-native';
import { todayStr } from './date';
const ENV_BASE = process.env.EXPO_PUBLIC_API_URL;

// The phone's local clock is authoritative for "today" / "this hour" — the server only
// falls back to its own clock for requests that don't say (curl, old cached app shells).
const localHour = () => new Date().getHours();
const BASE = ENV_BASE && ENV_BASE.length > 0 ? ENV_BASE : Platform.OS === 'web' ? '' : 'http://127.0.0.1:3000';

export const apiBase = BASE;
export const fileUrl = (path: string): string => `${BASE}${path}`;

async function req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body == null ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${method} ${path}${text ? ` — ${text.slice(0, 200)}` : ''}`);
    (err as any).status = res.status;
    throw err;
  }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? res.json() : (res.text() as unknown)) as Promise<T>;
}

// ── shared types ────────────────────────────────────────────────────────────
export interface Settings {
  display_name: string;
  units: 'lb' | 'kg';
  daily_calorie_goal: number;
  protein_goal_g: number;
  carb_goal_g: number;
  fat_goal_g: number;
  weight_start_lb: number | null;
  weight_target_lb: number | null;
  weigh_in_weekday: number;
  weigh_in_hour: number;
  workout_reminders: boolean;
  milestone_step_lb: number;
  tdee_window_days: number;
  onboarded: boolean;
  weekly_banking: boolean;
  sex: 'female' | 'male' | null;
  age: number | null;
  height_cm: number | null;
  activity_factor: number;
  goal_rate_lb: number;
}

export interface Food {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  source: string;
  serving_g: number | null;
  serving_label: string | null;
  unit_name: string | null;
  restaurant: string | null;
  eating_out: number;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
  label_photo: string | null;
  is_favorite: number;
  pref_unit_mode: 'grams' | 'servings' | null;
  last_grams: number | null;
}

export type Suggestion = Food & { reason?: string | null };

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

export interface LogEntry {
  id: number;
  day_date: string;
  meal_slot: string;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  eating_out: number;
}
export interface DaySummary {
  date: string;
  goal: number;
  totals: { kcal: number; protein: number; carb: number; fat: number };
  remaining: number;
  slots: Record<string, LogEntry[]>;
  slot_kcal: Record<string, number>;
  slots_complete: Record<string, boolean>;
  banking: boolean;
  bank_week: number;
  bank_capped: boolean;
  bank_skipped_days: number;
  bank_yesterday: number | null;
  bank_snoozed: boolean;
  adjusted_goal: number;
  adjusted_remaining: number;
}

export interface WeightEntry {
  id: number;
  entry_date: string;
  weight_lb: number;
  trend_lb: number | null;
  note: string | null;
}
export interface WeightGoal {
  start: number | null;
  target: number | null;
  lost: number | null;
  remaining: number | null;
  pct: number | null;
  eta_weeks: number | null;
  eta_weeks_low: number | null;
  eta_weeks_high: number | null;
  eta_confidence: 'low' | 'medium' | 'high' | null;
  eta_date: string | null;
  current_trend: number | null;
  current_raw: number | null;
  units: 'lb' | 'kg';
}
export interface Milestone {
  id: number;
  kind: string;
  threshold_lb: number;
  achieved_date: string;
  acknowledged: number;
}

export interface Workout {
  id: number;
  title: string;
  kind: string;
  scheduled_date: string | null;
  planned_minutes: number | null;
  external_url: string | null;
  notes: string | null;
  completed_at: string | null;
  completed_minutes: number | null;
}
export interface WalkPreset {
  id: number;
  label: string;
  default_minutes: number | null;
  default_distance: number | null;
}
export interface WalkLog {
  id: number;
  walk_date: string;
  label: string | null;
  minutes: number | null;
  distance: number | null;
  notes: string | null;
}
export interface Note {
  id: number;
  note_date: string;
  body: string;
  mood: string | null;
}
export interface Recipe {
  id: number;
  name: string;
  approx_kcal: number | null;
  cook_band: string | null;
  photo: string | null;
  ingredients: string | null;
  steps: string | null;
  tags_json: string;
  is_favorite: number;
}

export interface ParsedFood {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
}
export interface ParsedRecipe {
  name: string | null;
  approx_kcal: number | null;
  cook_band: 'under_30' | '30_60' | 'over_60' | null;
  tags: string[];
  ingredients: string | null;
  steps: string | null;
}
export interface Anomaly {
  severity: 'fyi' | 'heads_up';
  title: string;
  message: string;
  action: 'none' | 'open_day' | 'open_weight' | 'open_analytics';
}

export interface MealPlan {
  days: { label: string; meals: { slot: string; name: string; kcal: number }[]; total: number }[];
}

export interface Dashboard {
  settings: Settings;
  today: DaySummary;
  weight: { current_trend: number | null; lbs_per_week: number | null; label: string; goal: WeightGoal };
  workout: Workout | null;
  milestone: Milestone | null;
}

export interface Analytics {
  window_days: number;
  series: { date: string; raw: number; trend: number }[];
  weight: { current_raw: number | null; current_trend: number | null; lbs_per_week: number | null; lbs_per_week_sigma: number | null; label: string };
  tdee: {
    estimate: number | null;
    low: number | null;
    high: number | null;
    avg_intake: number | null;
    logged_days_in_window: number;
    weighins_in_window: number;
    reason: string | null;
  };
  goal: WeightGoal;
  projection: { date: string; weight: number; low: number; high: number }[];
  progress: { weighins_needed: number; logged_days_needed: number } | null;
  adherence: {
    days_logged: number;
    avg_intake: number | null;
    avg_intake_vs_goal: number | null;
    cumulative_deficit: number;
    logging_streak: number;
    under_goal_streak: number;
  };
}

export interface Supplement {
  id: number;
  name: string;
  sort_order: number;
  active: number;
}
export interface SupplementToday {
  id: number;
  name: string;
  taken: number;
}

export interface UsualItem {
  food_id: number | null;
  name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
}
export interface UsualMeal {
  found: boolean;
  slot: string;
  days_seen: number;
  items: UsualItem[];
}

export interface NewLogEntry {
  date: string;
  meal_slot: string;
  food_id?: number | null;
  name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
  unit_mode?: 'grams' | 'servings' | null;
  eating_out?: number;
  /** Set false to keep this entry out of the auto-learned foods library. */
  auto_food?: boolean;
}

export interface RestaurantComponent {
  name: string;
  category: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  default_on: boolean;
}
export interface RestaurantItem {
  name: string;
  components: RestaurantComponent[];
  note?: string | null;
  confidence?: 'published' | 'estimated';
}
export interface MenuComponent {
  id: number;
  restaurant: string;
  name: string;
  category: string | null;
  grams: number;
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  default_on: number;
  sort_order: number;
}

// ── grouped methods ─────────────────────────────────────────────────────────
export const api = {
  dashboard: () => req<Dashboard>('GET', `/api/dashboard?date=${todayStr()}`),

  settings: {
    get: () => req<Settings>('GET', '/api/settings'),
    update: (p: Partial<Settings>) => req<Settings>('PUT', '/api/settings', p),
    reminders: () => req<any>('GET', `/api/settings/reminders?date=${todayStr()}`),
  },

  foods: {
    list: (q?: string) => req<Food[]>('GET', `/api/foods${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    favorites: () => req<Food[]>('GET', '/api/foods?favorite=1'),
    suggestions: (p: { slot?: string; date?: string }) => {
      const qs = new URLSearchParams();
      if (p.slot) qs.set('slot', p.slot);
      if (p.date) qs.set('date', p.date);
      qs.set('hour', String(localHour()));
      return req<Suggestion[]>('GET', `/api/foods/suggestions?${qs}`);
    },
    create: (f: Partial<Food>) => req<Food>('POST', '/api/foods', f),
    update: (id: number, p: Partial<Food>) => req<Food>('PATCH', `/api/foods/${id}`, p),
    remove: (id: number) => req('DELETE', `/api/foods/${id}`),
    barcodeLocal: (code: string) => req<Food>('GET', `/api/foods/barcode/${encodeURIComponent(code)}`),
    restaurants: () => req<{ restaurant: string; count: number }[]>('GET', '/api/foods/restaurants'),
    dining: (restaurant?: string) => req<Food[]>('GET', `/api/foods?eating_out=1${restaurant ? `&restaurant=${encodeURIComponent(restaurant)}` : ''}`),
    dishes: () => req<Food[]>('GET', '/api/foods?dish=1'),
  },

  off: {
    search: (q: string) => req<OffFood[]>('GET', `/api/openfoodfacts/search?q=${encodeURIComponent(q)}`),
    barcode: (code: string) => req<OffFood>('GET', `/api/openfoodfacts/barcode/${encodeURIComponent(code)}`),
  },

  foodLog: {
    day: (date: string) => req<DaySummary>('GET', `/api/food-log?date=${date}`),
    add: (e: NewLogEntry) => req<DaySummary & { added_id: number }>('POST', '/api/food-log', { hour: localHour(), ...e }),
    snooze: (date: string, snoozed: boolean) => req<DaySummary>('POST', '/api/food-log/snooze', { date, snoozed }),
    mealComplete: (date: string, meal_slot: string, complete: boolean) => req<DaySummary>('POST', '/api/food-log/meal-complete', { date, meal_slot, complete }),
    diningStats: (date: string) => req<{ this_week: number; last_week: number }>('GET', `/api/food-log/dining-stats?date=${date}`),
    usual: (slot: string, date: string) => req<UsualMeal>('GET', `/api/food-log/usual?slot=${slot}&date=${date}`),
    update: (id: number, p: { grams?: number; meal_slot?: string }) => req<DaySummary>('PATCH', `/api/food-log/${id}`, p),
    remove: (id: number) => req<DaySummary>('DELETE', `/api/food-log/${id}`),
  },

  weight: {
    list: () => req<WeightEntry[]>('GET', '/api/weight'),
    log: (e: { entry_date?: string; weight_lb: number; note?: string }) =>
      req<{ entry: WeightEntry; milestones: { threshold_lb: number }[] }>('POST', '/api/weight', { entry_date: todayStr(), ...e }),
    update: (id: number, p: { weight_lb?: number; note?: string | null }) => req<WeightEntry>('PATCH', `/api/weight/${id}`, p),
    remove: (id: number) => req('DELETE', `/api/weight/${id}`),
    goal: () => req<WeightGoal>('GET', '/api/weight/goal'),
    setGoal: (g: { start_lb?: number | null; target_lb?: number | null }) => req<WeightGoal>('PUT', '/api/weight/goal', g),
    milestones: () => req<Milestone[]>('GET', '/api/weight/milestones'),
    ackMilestone: (id: number) => req('POST', `/api/weight/milestones/${id}/ack`),
  },

  weightPhotos: {
    list: (from?: string, to?: string) => req<any[]>('GET', `/api/weight-photos${from ? `?from=${from}&to=${to ?? from}` : ''}`),
    upload: (form: FormData) => req('POST', '/api/weight-photos', form),
  },

  workouts: {
    list: (from?: string, to?: string) => req<Workout[]>('GET', `/api/workouts${from ? `?from=${from}&to=${to ?? from}` : ''}`),
    create: (w: Partial<Workout>) => req<Workout>('POST', '/api/workouts', w),
    complete: (id: number, minutes?: number) => req<Workout>('POST', `/api/workouts/${id}/complete`, { minutes }),
    update: (id: number, p: Partial<Workout>) => req<Workout>('PATCH', `/api/workouts/${id}`, p),
    remove: (id: number) => req('DELETE', `/api/workouts/${id}`),
  },

  walks: {
    presets: () => req<WalkPreset[]>('GET', '/api/walks/presets'),
    createPreset: (p: Partial<WalkPreset>) => req<WalkPreset>('POST', '/api/walks/presets', p),
    deletePreset: (id: number) => req('DELETE', `/api/walks/presets/${id}`),
    log: (from?: string, to?: string) => req<WalkLog[]>('GET', `/api/walks/log${from ? `?from=${from}&to=${to ?? from}` : ''}`),
    quick: (presetId: number) => req<WalkLog>('POST', '/api/walks/log/quick', { preset_id: presetId, walk_date: todayStr() }),
    manual: (e: Partial<WalkLog>) => req<WalkLog>('POST', '/api/walks/log', { walk_date: todayStr(), ...e }),
    removeLog: (id: number) => req('DELETE', `/api/walks/log/${id}`),
  },

  notes: {
    list: () => req<Note[]>('GET', '/api/notes'),
    create: (n: { body: string; mood?: string | null; note_date?: string }) => req<Note>('POST', '/api/notes', { note_date: todayStr(), ...n }),
    update: (id: number, p: Partial<Note>) => req<Note>('PATCH', `/api/notes/${id}`, p),
    remove: (id: number) => req('DELETE', `/api/notes/${id}`),
  },

  recipes: {
    list: (params?: { q?: string; tag?: string; cook_band?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return req<Recipe[]>('GET', `/api/recipes${qs ? `?${qs}` : ''}`);
    },
    get: (id: number) => req<Recipe>('GET', `/api/recipes/${id}`),
    create: (form: FormData) => req<Recipe>('POST', '/api/recipes', form),
    update: (id: number, p: { name?: string; approx_kcal?: number | null; cook_band?: string | null; ingredients?: string | null; steps?: string | null; tags?: string }) =>
      req<Recipe>('PATCH', `/api/recipes/${id}`, p),
    favorite: (id: number) => req<Recipe>('POST', `/api/recipes/${id}/favorite`),
    remove: (id: number) => req('DELETE', `/api/recipes/${id}`),
  },

  analytics: { summary: () => req<Analytics>('GET', `/api/analytics/summary?date=${todayStr()}`) },

  supplements: {
    list: () => req<Supplement[]>('GET', '/api/supplements'),
    today: (date: string) => req<SupplementToday[]>('GET', `/api/supplements/today?date=${date}`),
    create: (name: string) => req<Supplement>('POST', '/api/supplements', { name }),
    update: (id: number, p: { name?: string; active?: boolean }) => req<Supplement>('PATCH', `/api/supplements/${id}`, p),
    remove: (id: number) => req('DELETE', `/api/supplements/${id}`),
    toggle: (id: number, date: string, taken: boolean) => req('POST', `/api/supplements/${id}/toggle`, { date, taken }),
  },

  restaurants: {
    components: (restaurant: string) => req<MenuComponent[]>('GET', `/api/restaurants/components?restaurant=${encodeURIComponent(restaurant)}`),
    saveComponent: (c: Partial<MenuComponent>) => req<MenuComponent>('POST', '/api/restaurants/components', c),
    updateComponent: (id: number, p: Partial<MenuComponent>) => req<MenuComponent>('PATCH', `/api/restaurants/components/${id}`, p),
    removeComponent: (id: number) => req('DELETE', `/api/restaurants/components/${id}`),
  },

  ai: {
    extractLabel: (form: FormData) =>
      req<{ nutrition: any; label_photo: string; confidence?: string; error?: string }>('POST', '/api/ai/extract-label', form),
    parseFood: (text: string, slot?: string) => req<{ items: ParsedFood[] }>('POST', '/api/ai/parse-food', { text, slot }),
    parseFoodPhoto: (form: FormData) => req<{ items: ParsedFood[]; error?: string }>('POST', '/api/ai/parse-food-photo', form),
    parseRecipe: (text: string) => req<{ recipe: ParsedRecipe | null; error?: string }>('POST', '/api/ai/parse-recipe', { text }),
    checkin: () => req<{ note: string | null }>('GET', '/api/ai/checkin'),
    daySummary: (date: string) => req<{ note: string | null }>('GET', `/api/ai/day-summary?date=${date}`),
    anomalies: (date: string) => req<{ anomalies: Anomaly[] }>('GET', `/api/ai/anomalies?date=${date}`),
    refreshCheckin: () => req<{ note: string | null }>('POST', '/api/ai/checkin/refresh'),
    mealPlan: (days: number) => req<{ plan: MealPlan | null }>('POST', '/api/ai/meal-plan', { days }),
    restaurantItem: (restaurant: string, item: string) => req<{ item: RestaurantItem | null; cached?: boolean; error?: string }>('POST', '/api/ai/restaurant-item', { restaurant, item }),
    restaurantMenu: (restaurant: string) => req<({ id: number; query: string } & RestaurantItem)[]>('GET', `/api/ai/restaurant-menu?restaurant=${encodeURIComponent(restaurant)}`),
    restaurantFullMenu: (restaurant: string) => req<{ components: RestaurantComponent[] }>('POST', '/api/ai/restaurant-menu-full', { restaurant }),
    complete: (text: string, context: string) => req<{ completion: string }>('POST', '/api/ai/complete', { text, context }),
  },

  dev: {
    reset: () => req('POST', '/api/dev/reset', { confirm: 'ERASE' }),
  },
};
