// AddFoodScreen.tsx — My foods (smart re-add) / Search (Open Food Facts) / Scan (barcode) /
// Describe (AI). Picking a food opens a grams/servings numpad sheet that logs it to the day.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Icon, Screen, SectionLabel, SegmentedControl, Sheet, T, TextField } from '../components';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { api, type Food, type OffFood } from '../lib/api';
import { Font, useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

type UnitMode = 'grams' | 'servings';

interface Picked {
  food_id?: number;
  name: string;
  brand?: string | null;
  serving_g?: number | null;
  serving_label?: string | null;
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
  const { slot, date } = route.params;
  // Default to "My foods" — most logging is re-adding things she already has. Scanning is the
  // exception (the button up top jumps straight to it).
  const [tab, setTab] = useState('My foods');
  const [picked, setPicked] = useState<Picked | null>(null);

  const add = useMutation({
    mutationFn: async (p: { grams: number; food: Picked; mode: UnitMode }) => {
      let foodId = p.food.food_id ?? null;
      // Save barcoded (scanned / searched) foods to the library so they're re-addable later.
      // Dedupe by barcode so re-scanning the same product never makes a duplicate.
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
            serving_g: p.food.serving_g ?? null,
            serving_label: p.food.serving_label ?? null,
            kcal_100g: p.food.kcal_100g,
            protein_100g: p.food.protein_100g,
            carb_100g: p.food.carb_100g,
            fat_100g: p.food.fat_100g,
          } as any);
          foodId = created.id;
        }
      }
      return api.foodLog.add({
        date,
        meal_slot: slot,
        food_id: foodId,
        name: p.food.name,
        grams: p.grams,
        unit_mode: p.mode,
        kcal_100g: p.food.kcal_100g,
        protein_100g: p.food.protein_100g,
        carb_100g: p.food.carb_100g,
        fat_100g: p.food.fat_100g,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['foodlog', date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['foods'] });
      setPicked(null);
      navigation.goBack();
    },
  });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 16 }}>
        <T w={800} size={26}>
          Add to {slot}
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
              Cancel
            </T>
          </Pressable>
        </View>
      </View>

      <View style={{ marginBottom: 16 }}>
        <SegmentedControl options={['My foods', 'Search', 'Scan', 'Describe']} value={tab} onChange={setTab} />
      </View>

      {tab === 'My foods' ? <FavoritesTab slot={slot} date={date} onPick={setPicked} /> : null}
      {tab === 'Search' ? <SearchTab onPick={setPicked} /> : null}
      {tab === 'Scan' ? <ScanTab onPick={setPicked} /> : null}
      {tab === 'Describe' ? <DescribeTab slot={slot} date={date} onDone={() => navigation.goBack()} /> : null}

      <View style={{ alignItems: 'center', paddingVertical: 16, gap: 10 }}>
        <Button variant="ghost" icon="plus" onPress={() => navigation.navigate('LabelCapture', { slot, date })}>
          Add a custom food
        </Button>
        <Button variant="ghost" icon="food" onPress={() => navigation.navigate('DishBuilder', { slot, date })}>
          Build a dish (big meal)
        </Button>
      </View>

      <GramsSheet picked={picked} slot={slot} onClose={() => setPicked(null)} onAdd={(grams, food, mode) => add.mutate({ grams, food, mode })} />
    </Screen>
  );
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
    barcode: f.barcode,
    pref_unit_mode: f.pref_unit_mode,
    last_grams: f.last_grams,
    kcal_100g: f.kcal_100g,
    protein_100g: f.protein_100g,
    carb_100g: f.carb_100g,
    fat_100g: f.fat_100g,
  };
}

function ResultRow({ name, brand, kcal100, onPress }: { name: string; brand?: string | null; kcal100: number; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: t.hairline }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="food" size={22} color={t.text3} />
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
      <View style={{ width: 38, height: 38, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" size={20} stroke={2.8} color="#fff" />
      </View>
    </Pressable>
  );
}

function SearchTab({ onPick }: { onPick: (p: Picked) => void }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(id);
  }, [text]);
  const results = useQuery({ queryKey: ['off', q], queryFn: () => api.off.search(q), enabled: q.length >= 2 });

  return (
    <View>
      <TextField label="Search foods" value={text} onChangeText={setText} placeholder="e.g. greek yogurt" autoFocus />
      {q.length >= 2 ? (
        <>
          <SectionLabel style={{ marginBottom: 10 }}>Results · per 100 g</SectionLabel>
          {results.isLoading ? (
            <T w={700} color={t.text3} style={{ padding: 8 }}>
              Searching…
            </T>
          ) : results.data && results.data.length ? (
            <Card pad={6}>
              {results.data.slice(0, 15).map((r, i) => (
                <ResultRow key={`${r.barcode}-${i}`} name={r.name} brand={r.brand} kcal100={r.kcal_100g} onPress={() => onPick(offToPicked(r))} />
              ))}
            </Card>
          ) : (
            <T w={700} color={t.text3} style={{ padding: 8 }}>
              No matches — try the AI label capture below.
            </T>
          )}
        </>
      ) : (
        <T w={600} size={14} color={t.text3} style={{ padding: 8 }}>
          Type at least 2 letters to search Open Food Facts.
        </T>
      )}
    </View>
  );
}

function FavoritesTab({ slot, date, onPick }: { slot: string; date: string; onPick: (p: Picked) => void }) {
  const t = useTheme();
  // Smart order: frequency + recency + this meal slot + what usually follows the last thing logged.
  const foods = useQuery({ queryKey: ['foods', 'suggestions', slot, date], queryFn: () => api.foods.suggestions({ slot, date }) });
  if (foods.isLoading)
    return (
      <T w={700} color={t.text3} style={{ padding: 8 }}>
        Loading your foods…
      </T>
    );
  if (!foods.data?.length)
    return (
      <T w={600} size={14} color={t.text3} style={{ padding: 8 }}>
        Foods you scan, search, or log will show up here — sorted by what you reach for most.
      </T>
    );
  return (
    <View>
      <SectionLabel style={{ marginBottom: 10 }}>Suggested for you</SectionLabel>
      <Card pad={6}>
        {foods.data.map((f) => (
          <ResultRow key={f.id} name={f.name} brand={f.brand} kcal100={f.kcal_100g} onPress={() => onPick(foodToPicked(f))} />
        ))}
      </Card>
    </View>
  );
}

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
    onError: (e: any) => setError(e?.status === 503 ? 'AI is off — add ANTHROPIC_API_KEY on the server.' : 'Couldn’t read that — try the Search tab.'),
  });

  const setGrams = (i: number, g: string) => setItems((xs) => (xs ? xs.map((it, idx) => (idx === i ? { ...it, grams: Number(g) || 0 } : it)) : xs));
  const remove = (i: number) => setItems((xs) => (xs ? xs.filter((_, idx) => idx !== i) : xs));

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
                <View style={{ width: 76, flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.hairline, borderRadius: 10, paddingHorizontal: 8 }}>
                  <TextInput value={String(it.grams)} onChangeText={(g) => setGrams(i, g)} keyboardType="numeric" style={{ flex: 1, fontFamily: Font[800], fontSize: 15, color: t.text, paddingVertical: 8 }} />
                  <T w={700} size={11} color={t.text3}>
                    g
                  </T>
                </View>
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
      const off = local ? null : await api.off.barcode(code).catch(() => null);
      const food = local ? foodToPicked(local as Food) : off ? offToPicked(off) : null;
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

// ── grams / servings entry ──────────────────────────────────────────────────

// Format a number for display: drop trailing zeros, cap at 3 decimals.
function trimNum(x: number): string {
  if (!isFinite(x) || x <= 0) return '0';
  return String(Math.round(x * 1000) / 1000);
}

// Parse a serving label like "2 links" or "1 cup" into a per-serving unit count, so servings
// can read out as real-world units (1.5 servings × 2 = 3 links). Mass/volume labels return null.
function parseServingUnits(label?: string | null): { per: number; unit: string } | null {
  if (!label) return null;
  const m = label.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:x\s*)?([A-Za-z][A-Za-z .'’-]*)/);
  if (!m) return null;
  const per = Number(m[1]);
  const unit = m[2].trim().replace(/[.\s]+$/, '');
  if (!per || !unit) return null;
  if (/^(g|gram|grams|kg|mg|ml|l|oz|fl|lb|lbs)\b/i.test(unit)) return null;
  return { per, unit };
}

const KEYS: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

function GramsSheet({
  picked,
  slot,
  onClose,
  onAdd,
}: {
  picked: Picked | null;
  slot: string;
  onClose: () => void;
  onAdd: (grams: number, food: Picked, mode: UnitMode) => void;
}) {
  const t = useTheme();
  const sv = picked?.serving_g && picked.serving_g > 0 ? picked.serving_g : null;
  const canServings = sv != null;
  const [mode, setMode] = useState<UnitMode>('grams');
  const [entry, setEntry] = useState('100');
  // "fresh" = the shown value is a pre-fill; the first keypress replaces it (start typing instantly).
  const [fresh, setFresh] = useState(true);

  useEffect(() => {
    if (!picked) return;
    const svLocal = picked.serving_g && picked.serving_g > 0 ? picked.serving_g : null;
    const startMode: UnitMode = svLocal && picked.pref_unit_mode === 'servings' ? 'servings' : 'grams';
    const startGrams = picked.last_grams ?? picked.serving_g ?? 100;
    setMode(startMode);
    setEntry(startMode === 'servings' && svLocal ? trimNum(startGrams / svLocal) : trimNum(startGrams));
    setFresh(true);
  }, [picked]);

  if (!picked) return null;

  const n = Number(entry) || 0;
  const grams = mode === 'servings' && sv ? n * sv : n;
  const servings = sv ? grams / sv : null;
  const kcal = Math.round((picked.kcal_100g * grams) / 100);
  const units = parseServingUnits(picked.serving_label);

  const press = (key: string) => {
    setEntry((cur) => {
      if (key === 'back') return fresh || cur.length <= 1 ? '0' : cur.slice(0, -1);
      const base = fresh || cur === '0' ? '' : cur;
      if (key === '.') return base.includes('.') ? base : `${base === '' ? '0' : base}.`;
      const next = base + key;
      return next.length > 7 ? base : next;
    });
    setFresh(false);
  };

  const switchMode = (m: UnitMode) => {
    if (m === mode || (m === 'servings' && !sv)) return;
    setEntry(m === 'servings' && sv ? trimNum(grams / sv) : trimNum(grams));
    setMode(m);
    setFresh(false);
  };

  return (
    <Sheet visible={!!picked} onClose={onClose} title={picked.name}>
      {picked.brand ? (
        <T w={700} size={14} color={t.text3} style={{ marginBottom: 12, marginTop: -6 }}>
          {picked.brand}
        </T>
      ) : null}

      {/* Grams + Servings shown together so you can cross-check; tap either to switch entry mode. */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <StatTile label="Grams" value={`${trimNum(grams)}`} unit="g" active={mode === 'grams'} onPress={() => switchMode('grams')} />
        {canServings ? (
          <StatTile
            label="Servings"
            value={servings != null ? trimNum(servings) : '—'}
            unit={units ? '' : 'serv'}
            sub={units ? `≈ ${trimNum((servings ?? 0) * units.per)} ${units.unit}` : undefined}
            active={mode === 'servings'}
            onPress={() => switchMode('servings')}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <T w={700} size={15} color={t.text2}>
          {canServings ? `Entering ${mode}` : "That's"}
        </T>
        <T num w={800} size={26} color={t.accentPress}>
          {kcal} kcal
        </T>
      </View>

      {/* On-screen numpad — no system keyboard, so it works the same on iPad and phone. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            style={({ pressed }) => ({
              width: '31.5%',
              flexGrow: 1,
              height: 56,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? t.accentSoft : t.surface,
              borderWidth: 1.5,
              borderColor: t.hairline,
            })}
          >
            {k === 'back' ? (
              <Icon name="chevL" size={22} stroke={2.4} color={t.text2} />
            ) : (
              <T w={800} size={23}>
                {k}
              </T>
            )}
          </Pressable>
        ))}
      </View>

      <Button full size="lg" icon="check" onPress={() => onAdd(grams, picked, mode)}>
        Add to {slot}
      </Button>
    </Sheet>
  );
}

function StatTile({
  label,
  value,
  unit,
  sub,
  active,
  onPress,
}: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: active ? t.accentSoft : t.surface2,
        borderWidth: 2,
        borderColor: active ? t.accent : t.hairline,
      }}
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
