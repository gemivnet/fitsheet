// AddFoodScreen.tsx — Find (your foods + Open Food Facts) / Scan / Describe. Picking a food opens
// an amount sheet (numpad, grams or named pieces). One-tap ＋ re-logs the remembered amount.
// After logging, the screen STAYS OPEN and the list re-ranks to what you usually log next.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AutocompleteField, Button, Card, Chip, Icon, NumberPad, Screen, SectionLabel, SegmentedControl, Sheet, T, TextField, useNumberField } from '../components';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { api, type Food, type OffFood, type Suggestion } from '../lib/api';
import { Font, useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

type UnitMode = 'grams' | 'servings';

const MEALS: { key: string; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

interface Picked {
  food_id?: number;
  name: string;
  brand?: string | null;
  serving_g?: number | null;
  serving_label?: string | null;
  unit_name?: string | null;
  barcode?: string | null;
  off_id?: string | null;
  pref_unit_mode?: UnitMode | null;
  last_grams?: number | null;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
}

type Props = NativeStackScreenProps<FoodStackParams, 'AddFood'>;

export function AddFoodScreen({ navigation, route }: Props) {
  const t = useTheme();
  const qc = useQueryClient();
  const { date } = route.params;
  const [slot, setSlot] = useState(route.params.slot);
  const [tab, setTab] = useState('Find');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [toast, setToast] = useState<{ name: string; id: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (name: string, id: number) => {
    setToast({ name, id });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['foods'] });
  };

  const add = useMutation({
    mutationFn: async (p: { grams: number; food: Picked; mode: UnitMode; servingG: number | null; unitName: string | null; slot: string }) => {
      let foodId = p.food.food_id ?? null;
      // Save barcoded (scanned / searched) foods to the library, deduped by barcode.
      if (foodId == null && p.food.barcode) {
        const existing = await api.foods.barcodeLocal(p.food.barcode).catch(() => null);
        if (existing) {
          foodId = existing.id;
        } else {
          const created = await api.foods.create({
            name: p.food.name,
            brand: p.food.brand ?? null,
            barcode: p.food.barcode,
            off_id: p.food.off_id ?? null,
            source: 'off',
            serving_g: p.servingG ?? p.food.serving_g ?? null,
            serving_label: p.food.serving_label ?? null,
            unit_name: p.unitName ?? p.food.unit_name ?? null,
            kcal_100g: p.food.kcal_100g,
            protein_100g: p.food.protein_100g,
            carb_100g: p.food.carb_100g,
            fat_100g: p.food.fat_100g,
          } as any);
          foodId = created.id;
        }
      }
      // Remember a piece she defined inline (grams-per-piece + its name).
      if (foodId != null) {
        const patch: Partial<Food> = {};
        if (p.servingG != null && p.servingG !== (p.food.serving_g ?? null)) patch.serving_g = p.servingG;
        if (p.unitName && p.unitName !== (p.food.unit_name ?? null)) patch.unit_name = p.unitName;
        if (Object.keys(patch).length) await api.foods.update(foodId, patch).catch(() => {});
      }
      const res = await api.foodLog.add({
        date,
        meal_slot: p.slot,
        food_id: foodId,
        name: p.food.name,
        grams: p.grams,
        unit_mode: p.mode,
        kcal_100g: p.food.kcal_100g,
        protein_100g: p.food.protein_100g,
        carb_100g: p.food.carb_100g,
        fat_100g: p.food.fat_100g,
      });
      return { id: res.added_id, name: p.food.name };
    },
    onSuccess: ({ id, name }) => {
      invalidate();
      setPicked(null);
      flash(name, id); // stay open — the list re-ranks to what comes next
    },
  });

  const undo = useMutation({
    mutationFn: (id: number) => api.foodLog.remove(id),
    onSuccess: () => {
      invalidate();
      setToast(null);
    },
  });

  // One-tap re-log of a saved food's remembered amount.
  const quickLog = (f: Food) =>
    add.mutate({
      grams: f.last_grams ?? f.serving_g ?? 100,
      food: foodToPicked(f),
      mode: f.pref_unit_mode ?? 'grams',
      servingG: f.serving_g,
      unitName: f.unit_name,
      slot,
    });

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 14 }}>
          <T w={800} size={26}>
            Add food
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Pressable
              onPress={() => setTab('Scan')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.accentSoft, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999 }}
            >
              <Icon name="camera" size={16} stroke={2.4} color={t.accentPress} />
              <T w={800} size={14} color={t.accentPress}>
                Scan
              </T>
            </Pressable>
            <Pressable onPress={() => navigation.goBack()}>
              <T w={800} size={16} color={t.accentPress}>
                Done
              </T>
            </Pressable>
          </View>
        </View>

        {/* meal selector — every add drops into this meal (override per item in the sheet) */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {MEALS.map((m) => (
            <Chip key={m.key} active={slot === m.key} onPress={() => setSlot(m.key)}>
              {m.label}
            </Chip>
          ))}
        </View>

        <View style={{ marginBottom: 16 }}>
          <SegmentedControl options={['Find', 'Scan', 'Describe']} value={tab} onChange={setTab} />
        </View>

        {tab === 'Find' ? <FindTab slot={slot} date={date} onPick={setPicked} onQuickLog={quickLog} /> : null}
        {tab === 'Scan' ? <ScanTab onPick={setPicked} /> : null}
        {tab === 'Describe' ? <DescribeTab slot={slot} date={date} onDone={() => navigation.goBack()} /> : null}

        <View style={{ alignItems: 'center', paddingVertical: 16, gap: 10 }}>
          <Button variant="soft" icon="food" full onPress={() => navigation.navigate('DiningOut', { slot, date })}>
            Dining out 🍔
          </Button>
          <Button variant="ghost" icon="plus" onPress={() => navigation.navigate('LabelCapture', { slot, date })}>
            Add a custom food
          </Button>
          <Button variant="ghost" icon="food" onPress={() => navigation.navigate('DishBuilder', { slot, date })}>
            Build a dish (big meal)
          </Button>
        </View>

        <AmountSheet picked={picked} slot={slot} onClose={() => setPicked(null)} onAdd={(grams, food, mode, servingG, unitName, slotSel) => add.mutate({ grams, food, mode, servingG, unitName, slot: slotSel })} />
      </Screen>

      {toast ? <UndoToast name={toast.name} onUndo={() => undo.mutate(toast.id)} /> : null}
    </View>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function trimNum(x: number): string {
  if (!isFinite(x) || x <= 0) return '0';
  return String(Math.round(x * 1000) / 1000);
}
function pluralLabel(name: string): string {
  const n = name.trim();
  if (!n) return 'Pieces';
  const p = /s$/i.test(n) ? n : `${n}s`;
  return p.charAt(0).toUpperCase() + p.slice(1);
}
function rememberedAmount(f: Food): string {
  if (f.pref_unit_mode === 'servings' && f.serving_g) {
    const c = (f.last_grams ?? f.serving_g) / f.serving_g;
    const nm = f.unit_name ? pluralLabel(f.unit_name).toLowerCase() : c === 1 ? 'serving' : 'servings';
    return `${trimNum(c)} ${nm}`;
  }
  return `${Math.round(f.last_grams ?? f.serving_g ?? 100)} g`;
}
function offToPicked(o: OffFood): Picked {
  return { name: o.name, brand: o.brand, serving_g: o.serving_g, serving_label: o.serving_label, barcode: o.barcode, off_id: o.off_id, kcal_100g: o.kcal_100g, protein_100g: o.protein_100g, carb_100g: o.carb_100g, fat_100g: o.fat_100g };
}
function foodToPicked(f: Food): Picked {
  return {
    food_id: f.id,
    name: f.name,
    brand: f.brand,
    serving_g: f.serving_g,
    serving_label: f.serving_label,
    unit_name: f.unit_name,
    barcode: f.barcode,
    pref_unit_mode: f.pref_unit_mode,
    last_grams: f.last_grams,
    kcal_100g: f.kcal_100g,
    protein_100g: f.protein_100g,
    carb_100g: f.carb_100g,
    fat_100g: f.fat_100g,
  };
}

// Typo-tolerant scorer for her own library: substring > all-tokens > subsequence.
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const s = target.toLowerCase();
  if (!q) return 0;
  if (s.includes(q)) return 100 + (s.startsWith(q) ? 50 : 0) - (s.length - q.length) * 0.1;
  const toks = q.split(/\s+/).filter(Boolean);
  if (toks.length > 1 && toks.every((tk) => s.includes(tk))) return 60;
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++;
  if (i === q.length) return 30 - (s.length - q.length) * 0.05;
  return 0;
}

// ── rows ─────────────────────────────────────────────────────────────────────

// Saved food: tap the body to adjust, tap ＋ to log the remembered amount instantly.
function SuggestionRow({ food, onAdd, onOpen }: { food: Suggestion; onAdd: () => void; onOpen: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: t.hairline }}>
      <Pressable onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingLeft: 14, paddingRight: 8, minWidth: 0 }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="food" size={21} color={t.text3} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={800} size={16} numberOfLines={1}>
            {food.name}
          </T>
          <T w={700} size={13} color={t.text3} numberOfLines={1}>
            {rememberedAmount(food)}
            {food.reason ? ` · ${food.reason}` : ''}
          </T>
        </View>
      </Pressable>
      <Pressable onPress={onAdd} hitSlop={8} style={{ width: 40, height: 40, marginRight: 12, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" size={21} stroke={2.8} color="#fff" />
      </Pressable>
    </View>
  );
}

// OFF / search result with no remembered amount: whole row opens the amount sheet.
function ResultRow({ name, brand, kcal100, onPress }: { name: string; brand?: string | null; kcal100: number; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: t.hairline }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="food" size={21} color={t.text3} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={800} size={16} numberOfLines={1}>
          {name}
        </T>
        <T w={700} size={13} color={t.text3} numberOfLines={1}>
          {brand ? `${brand} · ` : ''}
          <T num w={700} size={13} color={t.text3}>
            {Math.round(kcal100)}
          </T>{' '}
          kcal/100g
        </T>
      </View>
      <View style={{ width: 38, height: 38, borderRadius: 999, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" size={20} stroke={2.8} color={t.accentPress} />
      </View>
    </Pressable>
  );
}

// ── Find (suggestions + search) ──────────────────────────────────────────────

function FindTab({ slot, date, onPick, onQuickLog }: { slot: string; date: string; onPick: (p: Picked) => void; onQuickLog: (f: Food) => void }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(id);
  }, [text]);

  const searching = q.length >= 2;
  const suggestions = useQuery({ queryKey: ['foods', 'suggestions', slot, date], queryFn: () => api.foods.suggestions({ slot, date }), enabled: !searching });
  const mine = useQuery({ queryKey: ['foods', 'all'], queryFn: () => api.foods.list() });
  const off = useQuery({ queryKey: ['off', q], queryFn: () => api.off.search(q), enabled: searching });

  const localMatches = useMemo(() => {
    if (!searching || !mine.data) return [];
    return mine.data
      .map((f) => ({ f, score: fuzzyScore(q, `${f.name} ${f.brand ?? ''}`) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.f);
  }, [q, mine.data, searching]);
  const candidates = useMemo(() => (mine.data ?? []).map((f) => f.name), [mine.data]);

  return (
    <View>
      <AutocompleteField
        label="Find food"
        value={text}
        onChangeText={setText}
        placeholder="Search your foods + online"
        candidates={candidates}
        fetchCompletion={(txt) => api.ai.complete(txt, 'food item being searched in a calorie tracker').then((r) => r.completion)}
      />

      {!searching ? (
        suggestions.data && suggestions.data.length ? (
          <>
            <SectionLabel style={{ marginBottom: 10 }}>Suggested now</SectionLabel>
            <Card pad={6}>
              {suggestions.data.map((f) => (
                <SuggestionRow key={f.id} food={f} onAdd={() => onQuickLog(f)} onOpen={() => onPick(foodToPicked(f))} />
              ))}
            </Card>
          </>
        ) : suggestions.isLoading ? (
          <T w={700} color={t.text3} style={{ padding: 8 }}>
            Loading your foods…
          </T>
        ) : (
          <T w={600} size={14} color={t.text3} style={{ padding: 8 }}>
            Foods you scan, search, or log show up here — sorted by what you reach for most.
          </T>
        )
      ) : (
        <>
          {localMatches.length ? (
            <>
              <SectionLabel style={{ marginBottom: 10 }}>Your foods</SectionLabel>
              <Card pad={6} style={{ marginBottom: 16 }}>
                {localMatches.map((f) => (
                  <SuggestionRow key={`mine-${f.id}`} food={f} onAdd={() => onQuickLog(f)} onOpen={() => onPick(foodToPicked(f))} />
                ))}
              </Card>
            </>
          ) : null}
          <SectionLabel style={{ marginBottom: 10 }}>Open Food Facts · per 100 g</SectionLabel>
          {off.isLoading ? (
            <T w={700} color={t.text3} style={{ padding: 8 }}>
              Searching…
            </T>
          ) : off.data && off.data.length ? (
            <Card pad={6}>
              {off.data.slice(0, 15).map((r, i) => (
                <ResultRow key={`${r.barcode}-${i}`} name={r.name} brand={r.brand} kcal100={r.kcal_100g} onPress={() => onPick(offToPicked(r))} />
              ))}
            </Card>
          ) : localMatches.length ? (
            <T w={700} color={t.text3} style={{ padding: 8 }}>
              No other matches online.
            </T>
          ) : (
            <T w={700} color={t.text3} style={{ padding: 8 }}>
              No matches — try “Add a custom food” below.
            </T>
          )}
        </>
      )}
    </View>
  );
}

// ── Describe (AI natural-language) ───────────────────────────────────────────

interface NlItem {
  name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
}

function DescribeTab({ slot, date, onDone }: { slot: string; date: string; onDone: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [items, setItems] = useState<NlItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [padIdx, setPadIdx] = useState<number | null>(null);
  const pad = useNumberField('0');

  const parse = useMutation({
    mutationFn: () => api.ai.parseFood(text),
    onSuccess: (out) => {
      setError(null);
      setItems(
        out.items.map((p) => ({
          name: p.name,
          grams: Math.round(p.grams),
          kcal_100g: p.grams > 0 ? Math.round((p.kcal / p.grams) * 100) : 0,
          protein_100g: p.grams > 0 ? Math.round((p.protein_g / p.grams) * 100) : 0,
          carb_100g: p.grams > 0 ? Math.round((p.carb_g / p.grams) * 100) : 0,
          fat_100g: p.grams > 0 ? Math.round((p.fat_g / p.grams) * 100) : 0,
        })),
      );
    },
    onError: (e: any) => setError(e?.status === 503 ? 'AI is off — add ANTHROPIC_API_KEY on the server.' : 'Couldn’t read that — try the Find tab.'),
  });

  const setGrams = (i: number, g: number) => setItems((xs) => (xs ? xs.map((it, idx) => (idx === i ? { ...it, grams: g } : it)) : xs));
  const remove = (i: number) => setItems((xs) => (xs ? xs.filter((_, idx) => idx !== i) : xs));
  const openPad = (i: number) => {
    pad.reset(String(items?.[i].grams ?? 0));
    setPadIdx(i);
  };

  const logAll = async () => {
    if (!items) return;
    for (const it of items) {
      if (it.grams <= 0) continue;
      await api.foodLog.add({ date, meal_slot: slot, name: it.name, grams: it.grams, kcal_100g: it.kcal_100g, protein_100g: it.protein_100g, carb_100g: it.carb_100g, fat_100g: it.fat_100g });
    }
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    onDone();
  };

  const padItem = padIdx != null ? items?.[padIdx] : null;
  const padG = Number(pad.value) || 0;

  return (
    <View>
      <TextField label="What did you eat?" value={text} onChangeText={setText} placeholder="e.g. 2 eggs, toast with butter, and a latte" multiline autoFocus />
      <Button full icon="check" onPress={() => parse.mutate()}>
        {parse.isPending ? 'Reading…' : 'Estimate it'}
      </Button>
      {error ? (
        <T w={700} size={14} color={t.caution} style={{ marginTop: 12 }}>
          {error}
        </T>
      ) : null}
      {items && items.length ? (
        <View style={{ marginTop: 16 }}>
          <SectionLabel style={{ marginBottom: 8 }}>Found · tap grams to adjust</SectionLabel>
          <Card pad={6}>
            {items.map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i === items.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={800} size={15} numberOfLines={1}>
                    {it.name}
                  </T>
                  <T num w={700} size={12} color={t.text3}>
                    {Math.round((it.kcal_100g * it.grams) / 100)} kcal
                  </T>
                </View>
                <Pressable onPress={() => openPad(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.hairline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}>
                  <T num w={800} size={15}>
                    {it.grams}
                  </T>
                  <T w={700} size={11} color={t.text3}>
                    g
                  </T>
                </Pressable>
                <Pressable onPress={() => remove(i)} hitSlop={8}>
                  <T w={800} size={20} color={t.text3}>
                    ×
                  </T>
                </Pressable>
              </View>
            ))}
          </Card>
          <View style={{ marginTop: 12 }}>
            <Button full size="lg" icon="check" onPress={logAll}>
              Log {items.length} to {slot}
            </Button>
          </View>
        </View>
      ) : items ? (
        <T w={700} color={t.text3} style={{ marginTop: 12 }}>
          Nothing recognized — try rephrasing.
        </T>
      ) : null}

      <Sheet visible={padIdx != null} onClose={() => setPadIdx(null)} title={padItem?.name ?? 'Amount'}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <T num w={800} size={30}>
              {pad.value || '0'}
            </T>
            <T w={800} size={15} color={t.text3}>
              g
            </T>
          </View>
          {padItem ? (
            <T num w={800} size={24} color={t.accentPress}>
              {Math.round((padItem.kcal_100g * padG) / 100)} kcal
            </T>
          ) : null}
        </View>
        <View style={{ marginBottom: 16 }}>
          <NumberPad onKey={pad.press} />
        </View>
        <Button
          full
          size="lg"
          icon="check"
          onPress={() => {
            if (padIdx != null) setGrams(padIdx, padG);
            setPadIdx(null);
          }}
        >
          Done
        </Button>
      </Sheet>
    </View>
  );
}

function ScanTab({ onPick }: { onPick: (p: Picked) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const handle = async (code: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const local = await api.foods.barcodeLocal(code).catch(() => null);
      const offFood = local ? null : await api.off.barcode(code).catch(() => null);
      const food = local ? foodToPicked(local as Food) : offFood ? offToPicked(offFood) : null;
      if (food) onPick(food);
    } finally {
      setBusy(false);
      setTimeout(() => (locked.current = false), 1500);
    }
  };

  return (
    <View>
      <BarcodeScanner onScan={handle} />
      <T w={700} size={14} color={t.text3} style={{ textAlign: 'center', marginTop: 12 }}>
        {busy ? 'Looking it up…' : 'Point the camera at a product barcode.'}
      </T>
    </View>
  );
}

// ── amount sheet (grams / named pieces) ──────────────────────────────────────

function AmountSheet({
  picked,
  slot,
  onClose,
  onAdd,
}: {
  picked: Picked | null;
  slot: string;
  onClose: () => void;
  onAdd: (grams: number, food: Picked, mode: UnitMode, servingG: number | null, unitName: string | null, slot: string) => void;
}) {
  const t = useTheme();
  const [mode, setMode] = useState<UnitMode>('grams');
  const [entry, setEntry] = useState('100');
  const [pieceEntry, setPieceEntry] = useState('');
  const [unitName, setUnitName] = useState('');
  const [field, setField] = useState<'amount' | 'piece'>('amount');
  const [fresh, setFresh] = useState(true);
  const [sheetSlot, setSheetSlot] = useState(slot);

  useEffect(() => {
    if (!picked) return;
    const pg = picked.serving_g && picked.serving_g > 0 ? picked.serving_g : null;
    const startMode: UnitMode = pg && picked.pref_unit_mode === 'servings' ? 'servings' : 'grams';
    const startGrams = picked.last_grams ?? picked.serving_g ?? 100;
    setMode(startMode);
    setPieceEntry(pg != null ? trimNum(pg) : '');
    setUnitName(picked.unit_name ?? '');
    setField('amount');
    setEntry(startMode === 'servings' && pg ? trimNum(startGrams / pg) : trimNum(startGrams));
    setFresh(true);
    setSheetSlot(slot);
  }, [picked, slot]);

  if (!picked) return null;

  const pieceG = Number(pieceEntry) > 0 ? Number(pieceEntry) : null;
  const canUnits = pieceG != null;
  const effMode: UnitMode = canUnits ? mode : 'grams';
  const amt = Number(entry) || 0;
  const grams = effMode === 'servings' && pieceG ? amt * pieceG : amt;
  const count = pieceG ? grams / pieceG : null;
  const kcal = Math.round((picked.kcal_100g * grams) / 100);
  const fromServing = !picked.unit_name && picked.serving_g ? true : false;
  const piecesLabel = picked.unit_name || !fromServing ? pluralLabel(unitName) : 'Servings';

  const press = (key: string) => {
    if (field === 'piece') setPieceEntry((c) => applyKey(c, key));
    else setEntry((c) => applyKey(c, key));
    setFresh(false);
  };
  const applyKey = (cur: string, key: string): string => {
    if (key === 'back') return fresh || cur.length <= 1 ? '0' : cur.slice(0, -1);
    const base = fresh || cur === '0' ? '' : cur;
    if (key === '.') return base.includes('.') ? base : `${base === '' ? '0' : base}.`;
    const next = base + key;
    return next.length > 7 ? base : next;
  };

  const pickAmount = (m: UnitMode) => {
    if (m === 'servings' && !canUnits) {
      setField('piece');
      setFresh(true);
      return;
    }
    setField('amount');
    if (m !== mode) setEntry(m === 'servings' && pieceG ? trimNum(grams / pieceG) : trimNum(grams));
    setMode(m);
    // Re-arm "fresh" so the value shown (just selected/converted) is replaced by the next keypress
    // — tapping a tile and typing 2 should give 2, not append onto the old number.
    setFresh(true);
  };

  const setQuick = (v: string) => {
    setEntry(v);
    setField('amount');
    setFresh(true);
  };
  const quickChips =
    effMode === 'servings'
      ? ['1', '2', '3', '4']
      : Array.from(new Set([...(pieceG ? [trimNum(pieceG), trimNum(pieceG * 2)] : []), '50', '100', '150', '200']));

  return (
    <Sheet visible={!!picked} onClose={onClose} title={picked.name}>
      {picked.brand ? (
        <T w={700} size={14} color={t.text3} style={{ marginBottom: 12, marginTop: -6 }}>
          {picked.brand}
        </T>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        <StatTile label="Grams" value={trimNum(grams)} unit="g" active={field === 'amount' && effMode === 'grams'} onPress={() => pickAmount('grams')} />
        <StatTile
          label={piecesLabel}
          value={canUnits ? (count != null ? trimNum(count) : '—') : 'Set'}
          sub={canUnits ? undefined : 'tap to set size'}
          active={field === 'amount' && effMode === 'servings'}
          onPress={() => pickAmount('servings')}
        />
      </View>

      {/* piece editor — name it ("sausage") + how many grams it weighs; remembered on the food */}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, marginBottom: 12, backgroundColor: field === 'piece' ? t.accentSoft : t.surface2, borderWidth: 1.5, borderColor: field === 'piece' ? t.accent : t.hairline }}
      >
        <T w={700} size={14} color={t.text2}>
          1
        </T>
        <TextInput
          value={unitName}
          onChangeText={setUnitName}
          placeholder="piece (e.g. sausage)"
          placeholderTextColor={t.text3}
          style={{ flex: 1, fontFamily: Font[800], fontSize: 15, color: t.text, paddingVertical: 6 }}
        />
        <T w={700} size={14} color={t.text2}>
          =
        </T>
        <Pressable
          onPress={() => {
            setField('piece');
            setFresh(true);
          }}
          hitSlop={8}
          style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 9, backgroundColor: t.surface, borderWidth: 1.5, borderColor: field === 'piece' ? t.accent : t.hairline }}
        >
          <T w={800} size={15} color={field === 'piece' ? t.accentPress : t.text}>
            {pieceG != null ? `${trimNum(pieceG)} g` : 'set g'}
          </T>
        </Pressable>
      </View>

      {/* quick amounts */}
      {field === 'amount' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {quickChips.map((c) => (
            <Chip key={c} active={entry === c} onPress={() => setQuick(c)}>
              {effMode === 'servings' ? c : `${c} g`}
            </Chip>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <T w={700} size={15} color={t.text2}>
          {field === 'piece' ? `Grams in 1 ${unitName.trim() || 'piece'}` : effMode === 'servings' ? `Counting ${piecesLabel.toLowerCase()}` : 'Entering grams'}
        </T>
        {field === 'piece' ? null : (
          <T num w={800} size={26} color={t.accentPress}>
            {kcal} kcal
          </T>
        )}
      </View>

      <View style={{ marginBottom: 14 }}>
        <NumberPad onKey={press} />
      </View>

      {/* meal selector */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {MEALS.map((m) => (
          <Chip key={m.key} active={sheetSlot === m.key} onPress={() => setSheetSlot(m.key)}>
            {m.label}
          </Chip>
        ))}
      </View>

      {field === 'piece' ? (
        <Button
          full
          size="lg"
          icon="check"
          onPress={() => {
            setField('amount');
            setFresh(true);
          }}
        >
          Done
        </Button>
      ) : (
        <Button full size="lg" icon="check" onPress={() => onAdd(grams, picked, effMode, pieceG, unitName.trim() || null, sheetSlot)}>
          Add to {MEALS.find((m) => m.key === sheetSlot)?.label ?? sheetSlot}
        </Button>
      )}
    </Sheet>
  );
}

function StatTile({ label, value, unit, sub, active, onPress }: { label: string; value: string; unit?: string; sub?: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: active ? t.accentSoft : t.surface2, borderWidth: 2, borderColor: active ? t.accent : t.hairline }}
    >
      <T w={800} size={11} color={active ? t.accentPress : t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
        {label}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <T num w={800} size={26} color={active ? t.accentPress : t.text}>
          {value}
        </T>
        {unit ? (
          <T w={800} size={14} color={t.text3}>
            {unit}
          </T>
        ) : null}
      </View>
      {sub ? (
        <T w={700} size={12} color={t.text3} numberOfLines={1}>
          {sub}
        </T>
      ) : null}
    </Pressable>
  );
}

// ── undo toast ───────────────────────────────────────────────────────────────

function UndoToast({ name, onUndo }: { name: string; onUndo: () => void }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 240, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();
  }, [name, v]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 24,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        paddingLeft: 16,
        paddingRight: 8,
        borderRadius: 999,
        backgroundColor: t.text,
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
      }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 999, backgroundColor: t.success, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={14} stroke={3} color="#fff" />
      </View>
      <T w={800} size={15} color={t.bg} numberOfLines={1}>
        {name} logged
      </T>
      <Pressable onPress={onUndo} hitSlop={8} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' }}>
        <T w={800} size={14} color="#fff">
          Undo
        </T>
      </Pressable>
    </Animated.View>
  );
}
