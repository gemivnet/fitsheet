// AddFoodScreen.tsx — Scan (barcode) / Search (Open Food Facts) / Custom (AI label) / Favorites.
// Picking a food opens a grams sheet that logs it to the day.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Icon, Screen, SectionLabel, SegmentedControl, Sheet, T, TextField } from '../components';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { api, type Food, type OffFood } from '../lib/api';
import { useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

interface Picked {
  food_id?: number;
  name: string;
  brand?: string | null;
  serving_g?: number | null;
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
  const [tab, setTab] = useState('Search');
  const [picked, setPicked] = useState<Picked | null>(null);

  const onTab = (o: string) => {
    if (o === 'Custom') navigation.navigate('LabelCapture', { slot, date });
    else setTab(o);
  };

  const add = useMutation({
    mutationFn: (p: { grams: number; food: Picked }) =>
      api.foodLog.add({
        date,
        meal_slot: slot,
        food_id: p.food.food_id ?? null,
        name: p.food.name,
        grams: p.grams,
        kcal_100g: p.food.kcal_100g,
        protein_100g: p.food.protein_100g,
        carb_100g: p.food.carb_100g,
        fat_100g: p.food.fat_100g,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['foodlog', date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
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
        <Pressable onPress={() => navigation.goBack()}>
          <T w={800} size={16} color={t.accentPress}>
            Cancel
          </T>
        </Pressable>
      </View>

      <View style={{ marginBottom: 16 }}>
        <SegmentedControl options={['Scan', 'Search', 'Custom', 'Favorites']} value={tab} onChange={onTab} />
      </View>

      {tab === 'Search' ? <SearchTab onPick={setPicked} /> : null}
      {tab === 'Scan' ? <ScanTab onPick={setPicked} /> : null}
      {tab === 'Favorites' ? <FavoritesTab onPick={setPicked} /> : null}

      <View style={{ alignItems: 'center', paddingVertical: 16, gap: 10 }}>
        <Button variant="ghost" icon="plus" onPress={() => navigation.navigate('LabelCapture', { slot, date })}>
          Add a custom food
        </Button>
        <Button variant="ghost" icon="food" onPress={() => navigation.navigate('DishBuilder', { slot, date })}>
          Build a dish (big meal)
        </Button>
      </View>

      <GramsSheet picked={picked} slot={slot} onClose={() => setPicked(null)} onAdd={(grams, food) => add.mutate({ grams, food })} />
    </Screen>
  );
}

function offToPicked(o: OffFood): Picked {
  return { name: o.name, brand: o.brand, serving_g: o.serving_g, kcal_100g: o.kcal_100g, protein_100g: o.protein_100g, carb_100g: o.carb_100g, fat_100g: o.fat_100g };
}
function foodToPicked(f: Food): Picked {
  return { food_id: f.id, name: f.name, brand: f.brand, serving_g: f.serving_g, kcal_100g: f.kcal_100g, protein_100g: f.protein_100g, carb_100g: f.carb_100g, fat_100g: f.fat_100g };
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

function FavoritesTab({ onPick }: { onPick: (p: Picked) => void }) {
  const t = useTheme();
  const foods = useQuery({ queryKey: ['foods', 'all'], queryFn: () => api.foods.list() });
  if (!foods.data?.length)
    return (
      <T w={600} size={14} color={t.text3} style={{ padding: 8 }}>
        Your saved foods will appear here.
      </T>
    );
  return (
    <Card pad={6}>
      {foods.data.map((f) => (
        <ResultRow key={f.id} name={f.name} brand={f.brand} kcal100={f.kcal_100g} onPress={() => onPick(foodToPicked(f))} />
      ))}
    </Card>
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

function GramsSheet({ picked, slot, onClose, onAdd }: { picked: Picked | null; slot: string; onClose: () => void; onAdd: (grams: number, food: Picked) => void }) {
  const t = useTheme();
  const [grams, setGrams] = useState('100');
  useEffect(() => {
    if (picked) setGrams(String(picked.serving_g ?? 100));
  }, [picked]);
  if (!picked) return null;
  const g = Number(grams) || 0;
  const kcal = Math.round((picked.kcal_100g * g) / 100);
  return (
    <Sheet visible={!!picked} onClose={onClose} title={picked.name}>
      {picked.brand ? (
        <T w={700} size={14} color={t.text3} style={{ marginBottom: 14, marginTop: -6 }}>
          {picked.brand}
        </T>
      ) : null}
      <TextField label="Amount" value={grams} onChangeText={setGrams} keyboardType="numeric" suffix="grams" autoFocus />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <T w={700} size={15} color={t.text2}>
          That&rsquo;s
        </T>
        <T num w={800} size={24} color={t.accentPress}>
          {kcal} kcal
        </T>
      </View>
      <Button full size="lg" icon="check" onPress={() => onAdd(g, picked)}>
        Add to {slot}
      </Button>
    </Sheet>
  );
}
