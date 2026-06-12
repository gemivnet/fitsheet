// DiningOutScreen.tsx — log a fast-food / restaurant meal from an editable, per-restaurant menu of
// build-your-own parts. The AI seeds the menu with the chain's published nutrition; you assemble an
// order by ticking parts at light / normal / extra, edit values locally, and log it (tagged "eating
// out"). Saved orders re-log in one tap and also live in My foods.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applyNumberKey, AutocompleteField, Button, Card, Chip, Icon, NumberField, NumberPad, Screen, SectionLabel, Sheet, T, TextField } from '../components';
import { api, apiBase, type Food, type MenuComponent, type RestaurantComponent } from '../lib/api';
import { notify } from '../lib/dialog';
import { useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

const MEALS: { key: string; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

type Level = 'light' | 'normal' | 'extra';
const MULT: Record<Level, number> = { light: 0.5, normal: 1, extra: 2 };
const CAT_ORDER = ['base', 'protein', 'beans', 'topping', 'salsa', 'cheese', 'side', 'sauce', 'other'];
const catRank = (c?: string | null) => {
  const i = CAT_ORDER.indexOf((c || 'other').toLowerCase());
  return i < 0 ? CAT_ORDER.length : i;
};
const norm = (s: string) => s.toLowerCase().trim();

type Props = NativeStackScreenProps<FoodStackParams, 'DiningOut'>;

// Thin route wrapper (for any direct navigation); the real content is DiningOutTab, which Add food
// renders inline as a tab so the header persists.
export function DiningOutScreen({ navigation, route }: Props) {
  return (
    <Screen>
      <DiningOutTab slot={route.params.slot} date={route.params.date} goDay={() => navigation.goBack()} />
    </Screen>
  );
}

export function DiningOutTab({ slot, date, goDay }: { slot: string; date: string; goDay: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [restaurant, setRestaurant] = useState('');
  const [item, setItem] = useState('');
  const [orderName, setOrderName] = useState('');
  const [sel, setSel] = useState<Record<number, Level>>({});
  const [pending, setPending] = useState<{ name: string; on: boolean }[] | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<MenuComponent | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rest = restaurant.trim();
  const restaurants = useQuery({ queryKey: ['restaurants'], queryFn: api.foods.restaurants });
  const saved = useQuery({ queryKey: ['dining', rest], queryFn: () => api.foods.dining(rest), enabled: rest.length > 0 });
  const menu = useQuery({ queryKey: ['restaurant-components', rest], queryFn: () => api.restaurants.components(rest), enabled: rest.length > 0 });
  const cached = useQuery({ queryKey: ['restaurant-menu', rest], queryFn: () => api.ai.restaurantMenu(rest), enabled: rest.length > 0 });

  // resolve a pending name-based selection once the component menu is loaded
  useEffect(() => {
    if (!pending || !menu.data) return;
    const byName = new Map(menu.data.map((c) => [norm(c.name), c.id]));
    const next: Record<number, Level> = {};
    for (const p of pending) {
      const id = byName.get(norm(p.name));
      if (id != null && p.on) next[id] = 'normal';
    }
    setSel(next);
    setPending(null);
  }, [pending, menu.data]);

  const build = useMutation({
    mutationFn: () => api.ai.restaurantItem(rest, item.trim()),
    onSuccess: (out) => {
      if (!out.item) {
        setError(out.error === 'no_api_key' ? 'AI is off — add ANTHROPIC_API_KEY on the server.' : 'Couldn’t build that — try naming the item differently.');
        return;
      }
      setError(null);
      setOrderName(out.item.name);
      qc.invalidateQueries({ queryKey: ['restaurant-components', rest] });
      qc.invalidateQueries({ queryKey: ['restaurant-menu', rest] });
      setPending(out.item.components.map((c: RestaurantComponent) => ({ name: c.name, on: c.default_on })));
    },
    onError: (e: any) => setError(e?.status === 503 ? 'AI is off — add ANTHROPIC_API_KEY on the server.' : 'Couldn’t reach the server.'),
  });

  const loadCached = (name: string, comps: RestaurantComponent[]) => {
    setOrderName(name);
    setError(null);
    setPending(comps.map((c) => ({ name: c.name, on: c.default_on })));
  };

  const [menuLoading, setMenuLoading] = useState(false);
  const [streamNames, setStreamNames] = useState<string[]>([]);

  // Stream the full menu so options pop in live (real data > a vague spinner). Falls back to the
  // non-streaming endpoint if the browser can't read a streamed response.
  const loadFullMenu = async () => {
    if (menuLoading || !rest) return;
    setMenuLoading(true);
    setStreamNames([]);
    setError(null);
    const finish = () => {
      qc.invalidateQueries({ queryKey: ['restaurant-components', rest] });
      setMenuLoading(false);
    };
    try {
      const res = await fetch(`${apiBase}/api/ai/restaurant-menu-full-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant: rest }),
      });
      if (res.status === 503) {
        setError('AI is off — add ANTHROPIC_API_KEY on the server.');
        setMenuLoading(false);
        return;
      }
      const reader = (res as any).body?.getReader?.();
      if (!reader) {
        await api.ai.restaurantFullMenu(rest);
        finish();
        return;
      }
      const dec = new TextDecoder();
      let buf = '';
      let text = '';
      const seen = new Set<string>();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, '').trim();
          if (!line) continue;
          let msg: any;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (typeof msg.t === 'string') {
            text += msg.t;
            for (const m of text.matchAll(/"name"\s*:\s*"([^"]+)"/g)) {
              const n = m[1];
              if (!seen.has(n)) {
                seen.add(n);
                setStreamNames((a) => [...a, n]);
              }
            }
          }
          if (msg.error) setError('Couldn’t load the whole menu.');
        }
      }
      finish();
    } catch {
      try {
        await api.ai.restaurantFullMenu(rest);
        finish();
      } catch {
        setError('Couldn’t load the menu.');
        setMenuLoading(false);
      }
    }
  };

  const groups = useMemo(() => {
    const list = (menu.data ?? []).slice().sort((a, b) => catRank(a.category) - catRank(b.category) || a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const out: { cat: string; items: MenuComponent[] }[] = [];
    for (const c of list) {
      const cat = (c.category || 'other').toLowerCase();
      const g = out.find((x) => x.cat === cat) ?? (out.push({ cat, items: [] }), out[out.length - 1]);
      g.items.push(c);
    }
    return out;
  }, [menu.data]);

  const totals = useMemo(() => {
    const base = { grams: 0, kcal: 0, protein: 0, carb: 0, fat: 0 };
    for (const c of menu.data ?? []) {
      const lvl = sel[c.id];
      if (!lvl) continue;
      const m = MULT[lvl];
      base.grams += c.grams * m;
      base.kcal += c.kcal * m;
      base.protein += c.protein_g * m;
      base.carb += c.carb_g * m;
      base.fat += c.fat_g * m;
    }
    return base;
  }, [menu.data, sel]);

  const macros100 = {
    kcal_100g: totals.grams > 0 ? Math.round((totals.kcal / totals.grams) * 100) : 0,
    protein_100g: totals.grams > 0 ? Math.round((totals.protein / totals.grams) * 1000) / 10 : 0,
    carb_100g: totals.grams > 0 ? Math.round((totals.carb / totals.grams) * 1000) / 10 : 0,
    fat_100g: totals.grams > 0 ? Math.round((totals.fat / totals.grams) * 1000) / 10 : 0,
  };
  const canLog = totals.kcal > 0 && totals.grams > 0;
  const name = () => `${rest}${orderName ? ` · ${orderName}` : ''}`;

  const toggle = (id: number) =>
    setSel((s) => {
      const n = { ...s };
      if (n[id]) delete n[id];
      else n[id] = 'normal';
      return n;
    });

  const logOrder = async () => {
    if (!canLog) return;
    await api.foodLog.add({ date, meal_slot: slot, name: name(), grams: Math.round(totals.grams), eating_out: 1, ...macros100 });
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    goDay();
  };
  const saveOrder = async () => {
    if (!canLog) return;
    await api.foods.create({
      name: orderName || `${rest} order`,
      restaurant: rest,
      eating_out: 1,
      source: 'dining',
      serving_g: Math.round(totals.grams),
      unit_name: 'order',
      is_favorite: 1,
      ...macros100,
    } as any);
    qc.invalidateQueries({ queryKey: ['foods'] });
    qc.invalidateQueries({ queryKey: ['dining', rest] });
    qc.invalidateQueries({ queryKey: ['restaurants'] });
    notify('Saved', 'This order is in your foods for one-tap logging next time.');
  };

  const quickLogSaved = async (f: Food) => {
    await api.foodLog.add({
      date,
      meal_slot: slot,
      food_id: f.id,
      name: f.name,
      grams: f.serving_g ?? f.last_grams ?? 100,
      eating_out: 1,
      kcal_100g: f.kcal_100g,
      protein_100g: f.protein_100g,
      carb_100g: f.carb_100g,
      fat_100g: f.fat_100g,
    });
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    goDay();
  };

  return (
    <View>
      <AutocompleteField
        label="Restaurant"
        value={restaurant}
        onChangeText={setRestaurant}
        placeholder="e.g. Chipotle, McDonald's"
        candidates={(restaurants.data ?? []).map((r) => r.restaurant)}
      />
      {restaurants.data && restaurants.data.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 14 }}>
          {restaurants.data.map((r) => (
            <Chip key={r.restaurant} active={norm(rest) === norm(r.restaurant)} onPress={() => setRestaurant(r.restaurant)}>
              {r.restaurant}
            </Chip>
          ))}
        </View>
      ) : null}

      {rest.length === 0 ? (
        <T w={600} size={14} color={t.text3} style={{ padding: 8 }}>
          Pick a restaurant to see its menu, your saved orders, or build a new one.
        </T>
      ) : (
        <>
          {saved.data && saved.data.length ? (
            <View style={{ marginBottom: 16 }}>
              <SectionLabel style={{ marginBottom: 10 }}>Saved orders</SectionLabel>
              <Card pad={6}>
                {saved.data.map((f, i) => (
                  <Pressable key={f.id} onPress={() => quickLogSaved(f)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: i === saved.data!.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w={800} size={15} numberOfLines={1}>
                        {f.name}
                      </T>
                      <T num w={700} size={12} color={t.text3}>
                        {Math.round((f.kcal_100g * (f.serving_g ?? 100)) / 100)} kcal
                      </T>
                    </View>
                    <View style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="plus" size={18} stroke={2.8} color="#fff" />
                    </View>
                  </Pressable>
                ))}
              </Card>
            </View>
          ) : null}

          {/* build via AI */}
          <SectionLabel style={{ marginBottom: 4 }}>Build an order</SectionLabel>
          <T w={600} size={12} color={t.text3} style={{ marginBottom: 10 }}>
            Type your order and we&rsquo;ll tick the matching items in the menu below — then adjust amounts or extras.
          </T>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <AutocompleteField
                value={item}
                onChangeText={setItem}
                placeholder="What are you getting? e.g. chicken bowl"
                candidates={[...(menu.data ?? []).map((c) => c.name), ...(cached.data ?? []).map((c) => c.name)]}
                fetchCompletion={(txt) => api.ai.complete(txt, `a menu item or order at ${rest}`).then((r) => r.completion)}
                onSubmit={() => build.mutate()}
              />
            </View>
            <View style={{ marginBottom: 14 }}>
              <Button icon="star" onPress={() => build.mutate()}>
                {build.isPending ? '…' : 'Build'}
              </Button>
            </View>
          </View>
          {cached.data && cached.data.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {cached.data.map((m) => (
                <Chip key={m.id} icon="food" onPress={() => loadCached(m.name, m.components)}>
                  {m.name}
                </Chip>
              ))}
            </View>
          ) : null}
          {error ? (
            <T w={700} size={14} color={t.caution} style={{ marginBottom: 8 }}>
              {error}
            </T>
          ) : null}

          {/* the editable component menu */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 10 }}>
            <SectionLabel>Menu</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Pressable onPress={loadFullMenu} hitSlop={8} disabled={menuLoading}>
                <T w={800} size={13} color={t.accentPress}>
                  {menuLoading ? 'Loading…' : 'Load full menu'}
                </T>
              </Pressable>
              <Pressable onPress={() => setEditMode((v) => !v)} hitSlop={8}>
                <T w={800} size={13} color={t.accentPress}>
                  {editMode ? 'Done editing' : 'Edit menu'}
                </T>
              </Pressable>
            </View>
          </View>

          {menuLoading ? (
            <Card pad={18} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: streamNames.length ? 12 : 0 }}>
                <ActivityIndicator color={t.accent} />
                <T w={800} size={15}>
                  Reading {rest}&rsquo;s menu{streamNames.length ? ` · ${streamNames.length} found` : '…'}
                </T>
              </View>
              {streamNames.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {streamNames.map((n, i) => (
                    <View key={i} style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.accentSoft }}>
                      <T w={700} size={12} color={t.accentPress}>
                        {n}
                      </T>
                    </View>
                  ))}
                </View>
              ) : (
                <T w={600} size={13} color={t.text3} style={{ lineHeight: 19 }}>
                  Pulling the chain&rsquo;s published nutrition for every option — saved after, so next time is instant.
                </T>
              )}
            </Card>
          ) : menu.data && menu.data.length === 0 && !menu.isLoading ? (
            <Card pad={18} style={{ marginBottom: 10 }}>
              <T w={600} size={14} color={t.text2} style={{ marginBottom: 12, lineHeight: 20 }}>
                No menu yet. Pull {rest}&rsquo;s full build-your-own menu (every protein, salsa, side…) — or just “Build an order” above.
              </T>
              <Button full icon="star" onPress={loadFullMenu}>
                Load {rest}&rsquo;s full menu
              </Button>
            </Card>
          ) : null}

          {groups.map((g) => (
            <View key={g.cat} style={{ marginBottom: 10 }}>
              <T w={800} size={11} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginLeft: 4 }}>
                {g.cat}
              </T>
              <Card pad={6}>
                {g.items.map((c, i) => {
                  const lvl = sel[c.id];
                  const on = !!lvl;
                  const mult = on ? MULT[lvl] : 1;
                  const last = i === g.items.length - 1;
                  if (editMode) {
                    return (
                      <Pressable key={c.id} onPress={() => setEditing(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.hairline }}>
                        <Icon name="edit" size={18} color={t.text3} />
                        <T w={700} size={15} style={{ flex: 1 }} numberOfLines={1}>
                          {c.name}
                        </T>
                        <T num w={700} size={14} color={t.text3}>
                          {Math.round(c.kcal)} kcal · {Math.round(c.grams)} g
                        </T>
                      </Pressable>
                    );
                  }
                  return (
                    <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.hairline }}>
                      <Pressable onPress={() => toggle(c.id)} hitSlop={6}>
                        <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : 'transparent', borderWidth: on ? 0 : 1.8, borderColor: t.hairline }}>
                          {on ? <Icon name="check" size={15} stroke={3} color="#fff" /> : null}
                        </View>
                      </Pressable>
                      <Pressable onPress={() => toggle(c.id)} style={{ flex: 1, minWidth: 0 }}>
                        <T w={700} size={15} color={on ? t.text : t.text3} numberOfLines={1}>
                          {c.name}
                        </T>
                      </Pressable>
                      {on ? <LevelPick value={lvl} onChange={(l) => setSel((s) => ({ ...s, [c.id]: l }))} /> : null}
                      <T num w={800} size={14} color={on ? t.text : t.text3} style={{ width: 42, textAlign: 'right' }}>
                        {Math.round(c.kcal * mult)}
                      </T>
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}

          {editMode ? (
            <Button variant="ghost" icon="plus" onPress={() => setEditing('new')} style={{ marginBottom: 8 }}>
              Add a menu item
            </Button>
          ) : null}

          {/* order summary + actions */}
          {!editMode && canLog ? (
            <>
              <Card pad={18} style={{ marginTop: 6, backgroundColor: t.accentSofter }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <SectionLabel>Your order</SectionLabel>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <T num w={800} size={30} color={t.accentPress}>
                      {Math.round(totals.kcal)}
                    </T>
                    <T w={800} size={15} color={t.text2}>
                      kcal
                    </T>
                  </View>
                </View>
                <T w={700} size={13} color={t.text2} style={{ marginTop: 4 }}>
                  P {Math.round(totals.protein)} · C {Math.round(totals.carb)} · F {Math.round(totals.fat)} g · ~{Math.round(totals.grams)} g
                </T>
              </Card>
              <View style={{ gap: 10, marginTop: 12 }}>
                <Button full size="lg" icon="check" onPress={logOrder}>
                  Log to {MEALS.find((m) => m.key === slot)?.label ?? slot}
                </Button>
                <Button full variant="soft" icon="star" onPress={saveOrder}>
                  Save this order
                </Button>
              </View>
            </>
          ) : null}
        </>
      )}

      <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginTop: 16, lineHeight: 18 }}>
        Light = half · Extra = double. Numbers come from the chain&rsquo;s published nutrition and live
        on your server — tap “Edit menu” to correct anything.
      </T>

      <EditComponentSheet restaurant={rest} editing={editing} onClose={() => setEditing(null)} onRemoved={(id) => setSel((s) => { const n = { ...s }; delete n[id]; return n; })} />
    </View>
  );
}

function LevelPick({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  const t = useTheme();
  const opts: { k: Level; l: string }[] = [
    { k: 'light', l: 'L' },
    { k: 'normal', l: 'N' },
    { k: 'extra', l: 'E' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 2, backgroundColor: t.surface2, borderRadius: 9, padding: 2 }}>
      {opts.map((o) => (
        <Pressable key={o.k} onPress={() => onChange(o.k)} hitSlop={4} style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 7, backgroundColor: value === o.k ? t.accent : 'transparent' }}>
          <T w={800} size={12} color={value === o.k ? '#fff' : t.text3}>
            {o.l}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

type EFld = 'grams' | 'kcal' | 'protein' | 'carb' | 'fat';

function EditComponentSheet({
  restaurant,
  editing,
  onClose,
  onRemoved,
}: {
  restaurant: string;
  editing: MenuComponent | 'new' | null;
  onClose: () => void;
  onRemoved: (id: number) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const existing = editing && editing !== 'new' ? editing : null;
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [vals, setVals] = useState<Record<EFld, string>>({ grams: '', kcal: '', protein: '', carb: '', fat: '' });
  const [active, setActive] = useState<EFld | null>(null);
  const fresh = useRef(true);

  useEffect(() => {
    if (!editing) return;
    if (existing) {
      setName(existing.name);
      setCategory((existing.category || 'other').toLowerCase());
      setVals({ grams: String(existing.grams), kcal: String(existing.kcal), protein: String(existing.protein_g), carb: String(existing.carb_g), fat: String(existing.fat_g) });
    } else {
      setName('');
      setCategory('other');
      setVals({ grams: '', kcal: '', protein: '', carb: '', fat: '' });
    }
    setActive(null);
  }, [editing, existing]);

  const press = (k: string) => {
    if (!active) return;
    setVals((v) => ({ ...v, [active]: applyNumberKey(v[active], k, fresh.current) }));
    fresh.current = false;
  };
  const focus = (f: EFld) => {
    setActive(f);
    fresh.current = true;
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        restaurant,
        name: name.trim(),
        category,
        grams: Number(vals.grams) || 0,
        kcal: Number(vals.kcal) || 0,
        protein_g: Number(vals.protein) || 0,
        carb_g: Number(vals.carb) || 0,
        fat_g: Number(vals.fat) || 0,
        default_on: existing ? existing.default_on : 1,
      };
      return existing ? api.restaurants.updateComponent(existing.id, payload) : api.restaurants.saveComponent(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant-components', restaurant] });
      onClose();
    },
  });
  const del = useMutation({
    mutationFn: () => api.restaurants.removeComponent(existing!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant-components', restaurant] });
      if (existing) onRemoved(existing.id);
      onClose();
    },
  });

  if (!editing) return null;

  return (
    <Sheet visible={!!editing} onClose={onClose} title={existing ? 'Edit item' : 'Add menu item'}>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Guacamole" autoFocus={!existing} />
      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Category
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
        {CAT_ORDER.map((c) => (
          <Chip key={c} active={category === c} onPress={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <NumberField label="Calories" value={vals.kcal} unit="kcal" active={active === 'kcal'} onPress={() => focus('kcal')} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Grams" value={vals.grams} unit="g" active={active === 'grams'} onPress={() => focus('grams')} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <NumberField label="Protein" value={vals.protein} unit="g" active={active === 'protein'} onPress={() => focus('protein')} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Carbs" value={vals.carb} unit="g" active={active === 'carb'} onPress={() => focus('carb')} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Fat" value={vals.fat} unit="g" active={active === 'fat'} onPress={() => focus('fat')} />
        </View>
      </View>
      <View style={{ marginTop: 2, marginBottom: 14 }}>
        {active ? null : (
          <T w={700} size={13} color={t.text3} style={{ textAlign: 'center', marginBottom: 8 }}>
            Tap a box, then type.
          </T>
        )}
        <NumberPad onKey={press} keyHeight={50} />
      </View>
      <Button full size="lg" icon="check" onPress={() => save.mutate()}>
        {existing ? 'Save' : 'Add item'}
      </Button>
      {existing ? (
        <Pressable onPress={() => del.mutate()} style={{ alignItems: 'center', paddingVertical: 14 }}>
          <T w={800} size={15} color={t.caution}>
            Delete from menu
          </T>
        </Pressable>
      ) : null}
    </Sheet>
  );
}
