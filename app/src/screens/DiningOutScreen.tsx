// DiningOutScreen.tsx — items-first dining. Pick a restaurant → its menu loads (grounded in the
// chain's OFFICIAL web nutrition, cached) → tap the item(s) you're getting → customize each (toggle
// its parts + add-ons, set quantity) → review the order tray → log (one diary row per item, tagged
// "eating out"). Saved orders re-log in one tap.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AutocompleteField, Button, Card, Checkbox, Chip, Icon, Screen, SectionLabel, Sheet, showToast, T, TextField } from '../components';
import { api, apiBase, type Food, type ItemModifier, type MenuItem } from '../lib/api';
import { notify } from '../lib/dialog';
import { fuzzy } from '../lib/search';
import { FontSize, Space, useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

const MEALS: { key: string; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];
const norm = (s: string) => s.toLowerCase().trim();
const ITEM_KEYS = [{ name: 'name' as const, weight: 1 }];

interface Totals {
  grams: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
}
// A modifier is "on" if explicitly toggled, else its default. Unit totals = sum of on modifiers,
// or the item's own numbers when it has no breakdown.
const modOn = (m: ItemModifier, mods: Record<string, boolean>): boolean => mods[m.name] ?? m.default_on;
function unitTotals(item: MenuItem, mods: Record<string, boolean>): Totals {
  if (!item.modifiers.length) return { grams: item.grams, kcal: item.kcal, protein: item.protein_g, carb: item.carb_g, fat: item.fat_g };
  const acc: Totals = { grams: 0, kcal: 0, protein: 0, carb: 0, fat: 0 };
  for (const m of item.modifiers) {
    if (!modOn(m, mods)) continue;
    acc.grams += m.grams;
    acc.kcal += m.kcal;
    acc.protein += m.protein_g;
    acc.carb += m.carb_g;
    acc.fat += m.fat_g;
  }
  return acc;
}

interface TrayEntry {
  key: number;
  item: MenuItem;
  mods: Record<string, boolean>;
  qty: number;
}
let traySeq = 0;

type Props = NativeStackScreenProps<FoodStackParams, 'DiningOut'>;

// Thin route wrapper; the real content is DiningOutTab (Add food renders it inline as a tab).
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
  const [q, setQ] = useState(''); // menu search
  const [tray, setTray] = useState<TrayEntry[]>([]);
  const [customizing, setCustomizing] = useState<TrayEntry | null>(null);
  const [building, setBuilding] = useState(false);
  const [status, setStatus] = useState('');
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const builtFor = useRef<string>(''); // restaurants we've already auto-built, to avoid re-triggering

  const rest = restaurant.trim();
  const restaurants = useQuery({ queryKey: ['restaurants'], queryFn: api.foods.restaurants });
  const saved = useQuery({ queryKey: ['dining', rest], queryFn: () => api.foods.dining(rest), enabled: rest.length > 0 });
  const menu = useQuery({ queryKey: ['restaurant-items', rest], queryFn: () => api.ai.restaurantItems(rest), enabled: rest.length > 0 });

  const items = menu.data?.items ?? [];

  // Auto-build the menu the first time a restaurant has none cached (web search → structure).
  useEffect(() => {
    if (!rest || menu.isLoading || building) return;
    if (items.length === 0 && builtFor.current !== norm(rest)) {
      builtFor.current = norm(rest);
      void streamMenu(false);
    }
  }, [rest, menu.isLoading, items.length]);

  // reset transient menu state when the restaurant changes
  useEffect(() => {
    setQ('');
    setError(null);
    setSourceUrls([]);
  }, [rest]);

  const streamMenu = async (refresh: boolean) => {
    if (!rest || building) return;
    setBuilding(true);
    setError(null);
    setStatus('Looking up the menu…');
    try {
      const res = await fetch(`${apiBase}/api/ai/restaurant-items-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant: rest, refresh }),
      });
      if (res.status === 503) {
        setError('AI is off — add ANTHROPIC_API_KEY on the server.');
        setBuilding(false);
        return;
      }
      const reader = (res as any).body?.getReader?.();
      if (!reader) {
        await qc.invalidateQueries({ queryKey: ['restaurant-items', rest] });
        setBuilding(false);
        return;
      }
      const dec = new TextDecoder();
      let buf = '';
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
          if (typeof msg.status === 'string') setStatus(msg.status);
          if (msg.error) setError('Couldn’t load the menu — try again or add items by hand.');
          if (msg.done) setSourceUrls(Array.isArray(msg.sourceUrls) ? msg.sourceUrls : []);
        }
      }
      await qc.invalidateQueries({ queryKey: ['restaurant-items', rest] });
    } catch {
      setError('Couldn’t load the menu — try again.');
    } finally {
      setBuilding(false);
    }
  };

  const filtered = useMemo(() => (q.trim() ? fuzzy(q, items, ITEM_KEYS, 30) : items), [q, items]);

  // build one custom item the user typed that isn't on the menu
  const buildCustom = useMutation({
    mutationFn: () => api.ai.restaurantItemBuild(rest, customText.trim()),
    onSuccess: (out) => {
      if (!out.item) {
        setError('Couldn’t build that — try naming it differently.');
        return;
      }
      setCustomText('');
      openCustomize(out.item);
    },
    onError: (e: any) => setError(e?.status === 503 ? 'AI is off — add ANTHROPIC_API_KEY on the server.' : 'Couldn’t reach the server.'),
    meta: { suppressErrorToast: true },
  });

  const openCustomize = (item: MenuItem) => setCustomizing({ key: ++traySeq, item, mods: {}, qty: 1 });
  const commitCustomize = (entry: TrayEntry) => {
    setTray((tr) => {
      const i = tr.findIndex((e) => e.key === entry.key);
      return i >= 0 ? tr.map((e) => (e.key === entry.key ? entry : e)) : [...tr, entry];
    });
    setCustomizing(null);
  };
  const editTray = (e: TrayEntry) => setCustomizing(e);
  const removeTray = (key: number) => setTray((tr) => tr.filter((e) => e.key !== key));

  const trayTotals = useMemo(() => {
    const acc: Totals = { grams: 0, kcal: 0, protein: 0, carb: 0, fat: 0 };
    for (const e of tray) {
      const u = unitTotals(e.item, e.mods);
      acc.grams += (u.grams || 0) * e.qty;
      acc.kcal += u.kcal * e.qty;
      acc.protein += u.protein * e.qty;
      acc.carb += u.carb * e.qty;
      acc.fat += u.fat * e.qty;
    }
    return acc;
  }, [tray]);

  const logTray = async () => {
    if (!tray.length) return;
    let logged = 0;
    try {
      for (const e of tray) {
        const u = unitTotals(e.item, e.mods);
        const unitG = u.grams > 0 ? u.grams : 100;
        const grams = Math.round(unitG * e.qty);
        await api.foodLog.add({
          date,
          meal_slot: slot,
          name: `${rest} · ${e.item.name}`,
          grams,
          eating_out: 1,
          kcal_100g: Math.round((u.kcal / unitG) * 100),
          protein_100g: Math.round((u.protein / unitG) * 1000) / 10,
          carb_100g: Math.round((u.carb / unitG) * 1000) / 10,
          fat_100g: Math.round((u.fat / unitG) * 1000) / 10,
        });
        logged++;
      }
    } catch {
      showToast(logged ? 'Only some of that saved — check the day view' : 'Couldn’t log that — try again', { kind: 'error' });
      qc.invalidateQueries({ queryKey: ['foodlog', date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      return;
    }
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    goDay();
  };

  const quickLogSaved = async (f: Food) => {
    try {
      await api.foodLog.add({
        date,
        meal_slot: slot,
        food_id: f.id,
        name: f.restaurant ? `${f.restaurant} · ${f.name}` : f.name,
        grams: f.serving_g ?? f.last_grams ?? 100,
        eating_out: 1,
        kcal_100g: f.kcal_100g,
        protein_100g: f.protein_100g,
        carb_100g: f.carb_100g,
        fat_100g: f.fat_100g,
      });
    } catch {
      showToast('Couldn’t log that — try again', { kind: 'error' });
      return;
    }
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    goDay();
  };

  const host = (u: string) => {
    try {
      return new URL(u).host.replace(/^www\./, '');
    } catch {
      return 'source';
    }
  };

  return (
    <View>
      <AutocompleteField
        label="Restaurant"
        value={restaurant}
        onChangeText={setRestaurant}
        placeholder="e.g. Chipotle, McDonald's"
        candidates={(restaurants.data ?? []).map((r) => r.restaurant)}
        showDropdown
        autoCapitalize="words"
      />
      {restaurants.data && restaurants.data.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space[2], marginTop: -4, marginBottom: Space[3.5] }}>
          {restaurants.data.map((r) => (
            <Chip key={r.restaurant} active={norm(rest) === norm(r.restaurant)} onPress={() => setRestaurant(r.restaurant)}>
              {r.restaurant}
            </Chip>
          ))}
        </View>
      ) : null}

      {rest.length === 0 ? (
        <T w={600} size={FontSize.meta} color={t.text3} style={{ padding: Space[2] }}>
          Pick a restaurant to see its menu and build your order.
        </T>
      ) : (
        <>
          {/* saved orders — one-tap re-log */}
          {saved.data && saved.data.length ? (
            <View style={{ marginBottom: Space[4] }}>
              <SectionLabel style={{ marginBottom: Space[2.5] }}>Saved orders</SectionLabel>
              <Card pad={6}>
                {saved.data.map((f, i) => (
                  <Pressable
                    key={f.id}
                    onPress={() => quickLogSaved(f)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: Space[3], padding: Space[3], borderBottomWidth: i === saved.data!.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w={800} size={FontSize.body} numberOfLines={1}>
                        {f.name}
                      </T>
                      <T num w={700} size={FontSize.caption} color={t.text3}>
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

          {/* menu header + source + refresh */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Space[2.5] }}>
            <SectionLabel>Menu</SectionLabel>
            <Pressable onPress={() => streamMenu(true)} hitSlop={8} disabled={building}>
              <T w={800} size={FontSize.label} color={t.accentPress}>
                {building ? 'Loading…' : 'Refresh from web'}
              </T>
            </Pressable>
          </View>
          {sourceUrls.length || items.some((it) => it.confidence === 'official') ? (
            <Pressable onPress={() => sourceUrls[0] && Linking.openURL(sourceUrls[0])} disabled={!sourceUrls.length} style={{ marginBottom: Space[2.5] }}>
              <T w={700} size={FontSize.caption} color={t.text3}>
                {sourceUrls.length ? `Official nutrition · ${host(sourceUrls[0])} ↗` : 'Official nutrition'}
              </T>
            </Pressable>
          ) : null}

          {building ? (
            <Card pad={18} style={{ marginBottom: Space[2.5] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space[2.5] }}>
                <ActivityIndicator color={t.accent} />
                <T w={800} size={FontSize.body} style={{ flexShrink: 1 }} numberOfLines={2}>
                  {status || 'Looking up the menu…'}
                </T>
              </View>
            </Card>
          ) : null}

          {error ? (
            <T w={700} size={FontSize.meta} color={t.caution} style={{ marginBottom: Space[2] }}>
              {error}
            </T>
          ) : null}

          {/* menu item list */}
          {items.length ? (
            <>
              {items.length > 8 ? <TextField value={q} onChangeText={setQ} placeholder="Search the menu" /> : null}
              <Card pad={6} style={{ marginBottom: Space[3] }}>
                {filtered.map((it, i) => (
                  <Pressable
                    key={`${it.name}-${i}`}
                    onPress={() => openCustomize(it)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: Space[3], padding: Space[3], borderBottomWidth: i === filtered.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w={800} size={FontSize.body} numberOfLines={1}>
                        {it.name}
                      </T>
                      <T num w={700} size={FontSize.caption} color={t.text3}>
                        {Math.round(it.kcal)} kcal
                        {it.modifiers.length ? ` · ${it.modifiers.length} options` : ''}
                      </T>
                    </View>
                    <ConfidenceBadge confidence={it.confidence} />
                    <View style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="plus" size={18} stroke={2.8} color={t.accentPress} />
                    </View>
                  </Pressable>
                ))}
                {filtered.length === 0 ? (
                  <T w={600} size={FontSize.meta} color={t.text3} style={{ padding: Space[2] }}>
                    No match — add it as a custom item below.
                  </T>
                ) : null}
              </Card>
            </>
          ) : !building ? (
            <T w={600} size={FontSize.meta} color={t.text3} style={{ marginBottom: Space[3], lineHeight: 20 }}>
              No menu yet. Tap “Refresh from web”, or add what you’re having as a custom item.
            </T>
          ) : null}

          {/* add a custom item not on the menu */}
          <View style={{ flexDirection: 'row', gap: Space[2.5], alignItems: 'flex-end', marginBottom: Space[4] }}>
            <View style={{ flex: 1 }}>
              <AutocompleteField
                value={customText}
                onChangeText={setCustomText}
                placeholder="Not listed? Type it (e.g. spicy deluxe, no pickles)"
                candidates={items.map((it) => it.name)}
                onSubmit={() => customText.trim() && buildCustom.mutate()}
              />
            </View>
            <View style={{ marginBottom: 14 }}>
              <Button icon="plus" onPress={() => customText.trim() && buildCustom.mutate()}>
                {buildCustom.isPending ? '…' : 'Add'}
              </Button>
            </View>
          </View>

          {/* order tray */}
          {tray.length ? (
            <Card pad={18} style={{ marginTop: Space[1], marginBottom: Space[3], backgroundColor: t.accentSofter }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Space[2.5] }}>
                <SectionLabel>Your order</SectionLabel>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: Space[1.5] }}>
                  <T num w={800} size={FontSize.h1} color={t.accentPress}>
                    {Math.round(trayTotals.kcal)}
                  </T>
                  <T w={800} size={FontSize.body} color={t.text2}>
                    kcal
                  </T>
                </View>
              </View>
              {tray.map((e) => {
                const u = unitTotals(e.item, e.mods);
                return (
                  <View key={e.key} style={{ flexDirection: 'row', alignItems: 'center', gap: Space[2.5], paddingVertical: Space[2] }}>
                    <Pressable onPress={() => editTray(e)} style={{ flex: 1, minWidth: 0 }}>
                      <T w={800} size={FontSize.body} numberOfLines={1}>
                        {e.qty > 1 ? `${e.qty}× ` : ''}
                        {e.item.name}
                      </T>
                      <T num w={700} size={FontSize.caption} color={t.text2}>
                        {Math.round(u.kcal * e.qty)} kcal · tap to customize
                      </T>
                    </Pressable>
                    <Pressable onPress={() => removeTray(e.key)} hitSlop={8}>
                      <T w={800} size={FontSize.subtitle} color={t.text3}>
                        ×
                      </T>
                    </Pressable>
                  </View>
                );
              })}
              <T w={700} size={FontSize.caption} color={t.text2} style={{ marginTop: Space[1], lineHeight: 17 }}>
                P {Math.round(trayTotals.protein)} · C {Math.round(trayTotals.carb)} · F {Math.round(trayTotals.fat)} g · ~{Math.round(trayTotals.grams)} g
              </T>
            </Card>
          ) : null}

          {tray.length ? (
            <Button full size="lg" icon="check" onPress={logTray}>
              Log {tray.length} {tray.length === 1 ? 'item' : 'items'} to {MEALS.find((m) => m.key === slot)?.label ?? slot}
            </Button>
          ) : null}
        </>
      )}

      <T w={600} size={FontSize.caption} color={t.text3} style={{ textAlign: 'center', marginTop: Space[4], lineHeight: 18 }}>
        Items badged “Official” use the chain’s published nutrition pulled from the web (cached on your
        server). Tap an item to add it, then customize what’s on it.
      </T>

      <CustomizeSheet entry={customizing} onClose={() => setCustomizing(null)} onCommit={commitCustomize} />
    </View>
  );
}

function ConfidenceBadge({ confidence }: { confidence: MenuItem['confidence'] }) {
  const t = useTheme();
  if (confidence === 'official') {
    return (
      <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.successSoft }}>
        <T w={800} size={FontSize.micro} color={t.success}>
          OFFICIAL
        </T>
      </View>
    );
  }
  if (confidence === 'estimated') {
    return (
      <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.cautionSoft }}>
        <T w={800} size={FontSize.micro} color={t.caution}>
          EST
        </T>
      </View>
    );
  }
  return null;
}

// Customize one item: toggle its parts + add-ons, set quantity, see live kcal, add to the order.
function CustomizeSheet({ entry, onClose, onCommit }: { entry: TrayEntry | null; onClose: () => void; onCommit: (e: TrayEntry) => void }) {
  const t = useTheme();
  const [mods, setMods] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (entry) {
      setMods(entry.mods);
      setQty(entry.qty);
    }
  }, [entry?.key]);

  if (!entry) return null;
  const item = entry.item;
  const u = unitTotals(item, mods);
  const parts = item.modifiers.filter((m) => m.kind === 'part');
  const addons = item.modifiers.filter((m) => m.kind === 'addon');

  const toggle = (name: string, def: boolean) => setMods((m) => ({ ...m, [name]: !(m[name] ?? def) }));
  const Row = (m: ItemModifier, last: boolean) => {
    const on = modOn(m, mods);
    return (
      <View key={m.name} style={{ flexDirection: 'row', alignItems: 'center', gap: Space[2.5], paddingVertical: Space[2.5], borderBottomWidth: last ? 0 : 1, borderBottomColor: t.hairline }}>
        <Checkbox checked={on} onToggle={() => toggle(m.name, m.default_on)} size={22} />
        <T w={700} size={FontSize.body} color={on ? t.text : t.text3} numberOfLines={1} style={{ flex: 1 }}>
          {m.kind === 'addon' && !on ? `Add ${m.name}` : m.name}
        </T>
        <T num w={700} size={FontSize.meta} color={on ? t.text2 : t.text3}>
          {m.kcal > 0 ? `${m.kind === 'addon' ? '+' : ''}${Math.round(m.kcal)}` : ''}
        </T>
      </View>
    );
  };

  return (
    <Sheet visible={!!entry} onClose={onClose} title={item.name}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: Space[1.5] }}>
          <T num w={800} size={FontSize.display} color={t.accentPress}>
            {Math.round(u.kcal * qty)}
          </T>
          <T w={800} size={FontSize.body} color={t.text2}>
            kcal
          </T>
        </View>
        {/* quantity stepper */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space[3] }}>
          <Pressable onPress={() => setQty((n) => Math.max(1, n - 1))} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <T w={800} size={FontSize.subtitle} color={t.text2}>
              −
            </T>
          </Pressable>
          <T num w={800} size={FontSize.subtitle} style={{ minWidth: 22, textAlign: 'center' }}>
            {qty}
          </T>
          <Pressable onPress={() => setQty((n) => n + 1)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T w={800} size={FontSize.subtitle} color={t.accentPress}>
              +
            </T>
          </Pressable>
        </View>
      </View>

      {parts.length ? (
        <>
          <SectionLabel style={{ marginBottom: Space[1] }}>What’s on it</SectionLabel>
          <View style={{ marginBottom: Space[3] }}>{parts.map((m, i) => Row(m, i === parts.length - 1))}</View>
        </>
      ) : null}
      {addons.length ? (
        <>
          <SectionLabel style={{ marginBottom: Space[1] }}>Add-ons</SectionLabel>
          <View style={{ marginBottom: Space[3] }}>{addons.map((m, i) => Row(m, i === addons.length - 1))}</View>
        </>
      ) : null}
      {!item.modifiers.length ? (
        <T w={600} size={FontSize.meta} color={t.text3} style={{ marginBottom: Space[3] }}>
          No breakdown for this one — log it as-is, or adjust the quantity.
        </T>
      ) : null}

      <Button full size="lg" icon="check" onPress={() => onCommit({ ...entry, mods, qty })}>
        Add to order
      </Button>
    </Sheet>
  );
}
