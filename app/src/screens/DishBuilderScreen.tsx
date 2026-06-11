// DishBuilderScreen.tsx — "big meal" calculator. Add a dish's ingredients → total calories →
// divide by the COOKED weight → multiply by your portion. A finished dish is just a per-100g
// custom food, so you can log a portion now and/or save it to Favorites for next time.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { applyNumberKey, Button, Card, Icon, NumberField, NumberPad, Screen, SectionLabel, Sheet, T, TextField, useNumberField } from '../components';
import { api, type Food, type OffFood } from '../lib/api';
import { notify } from '../lib/dialog';
import { useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

interface Ingredient {
  id: number;
  name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
}
interface Pick {
  name: string;
  kcal_100g: number;
  protein_100g: number;
  carb_100g: number;
  fat_100g: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

type Props = NativeStackScreenProps<FoodStackParams, 'DishBuilder'>;

export function DishBuilderScreen({ navigation, route }: Props) {
  const t = useTheme();
  const qc = useQueryClient();
  const { slot, date } = route.params;
  const nextId = useRef(1);

  const [name, setName] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [cookedWeight, setCookedWeight] = useState('');
  const [portion, setPortion] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [active, setActive] = useState<'cooked' | 'ate'>('ate');
  const fresh = useRef(true);
  const focus = (f: 'cooked' | 'ate') => {
    setActive(f);
    fresh.current = true;
  };
  const pressNum = (k: string) => {
    const setter = active === 'cooked' ? setCookedWeight : setPortion;
    setter((cur) => applyNumberKey(cur, k, fresh.current));
    fresh.current = false;
  };

  const totals = ingredients.reduce(
    (a, i) => ({
      kcal: a.kcal + (i.kcal_100g * i.grams) / 100,
      protein: a.protein + (i.protein_100g * i.grams) / 100,
      carb: a.carb + (i.carb_100g * i.grams) / 100,
      fat: a.fat + (i.fat_100g * i.grams) / 100,
    }),
    { kcal: 0, protein: 0, carb: 0, fat: 0 },
  );
  const summed = ingredients.reduce((a, i) => a + i.grams, 0);
  const cooked = Number(cookedWeight) || summed;
  const per100 =
    cooked > 0
      ? { kcal: Math.round((totals.kcal / cooked) * 100), protein: r1((totals.protein / cooked) * 100), carb: r1((totals.carb / cooked) * 100), fat: r1((totals.fat / cooked) * 100) }
      : { kcal: 0, protein: 0, carb: 0, fat: 0 };
  const ateGrams = Number(portion) || 0;
  const ateKcal = cooked > 0 ? Math.round((totals.kcal * ateGrams) / cooked) : 0;

  const addIngredient = (p: Pick, grams: number) =>
    setIngredients((xs) => [...xs, { id: nextId.current++, name: p.name, grams, kcal_100g: p.kcal_100g, protein_100g: p.protein_100g, carb_100g: p.carb_100g, fat_100g: p.fat_100g }]);
  const removeIngredient = (id: number) => setIngredients((xs) => xs.filter((x) => x.id !== id));

  async function logPortion() {
    if (!ateGrams || cooked <= 0) return;
    await api.foodLog.add({ date, meal_slot: slot, name: name.trim() || 'Dish', grams: ateGrams, kcal_100g: per100.kcal, protein_100g: per100.protein, carb_100g: per100.carb, fat_100g: per100.fat });
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    navigation.goBack();
  }
  async function saveDish() {
    if (cooked <= 0 || !ingredients.length) return;
    await api.foods.create({ name: name.trim() || 'Dish', source: 'custom', serving_g: ateGrams || null, kcal_100g: per100.kcal, protein_100g: per100.protein, carb_100g: per100.carb, fat_100g: per100.fat, is_favorite: 1 } as any);
    qc.invalidateQueries({ queryKey: ['foods'] });
    notify('Saved', 'This dish is in your Favorites for next time.');
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 6 }}>
        <T w={800} size={26}>
          Build a dish
        </T>
        <Pressable onPress={() => navigation.goBack()}>
          <T w={800} size={16} color={t.accentPress}>
            Cancel
          </T>
        </Pressable>
      </View>
      <T w={600} size={14} color={t.text2} style={{ marginBottom: 16, lineHeight: 20 }}>
        Add what went into the dish, enter the cooked weight, then how much you ate — we&rsquo;ll do the math.
      </T>

      <TextField label="Dish name" value={name} onChangeText={setName} placeholder="e.g. Chicken curry" />

      <Card pad={16} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: ingredients.length ? 4 : 0 }}>
          <SectionLabel>Ingredients</SectionLabel>
          <Pressable onPress={() => setPickerOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.accentSoft, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 }}>
            <Icon name="plus" size={15} stroke={2.6} color={t.accentPress} />
            <T w={800} size={13} color={t.accentPress}>
              Add
            </T>
          </Pressable>
        </View>
        {ingredients.length === 0 ? (
          <T w={600} size={14} color={t.text3} style={{ paddingTop: 8 }}>
            No ingredients yet — tap Add.
          </T>
        ) : (
          ingredients.map((i, idx) => (
            <Pressable key={i.id} onLongPress={() => removeIngredient(i.id)} delayLongPress={250}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: idx === ingredients.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <T w={700} size={15} numberOfLines={1}>
                    {i.name}
                  </T>
                  <T num w={700} size={12} color={t.text3}>
                    {i.grams} g
                  </T>
                </View>
                <T num w={800} size={15}>
                  {Math.round((i.kcal_100g * i.grams) / 100)}
                </T>
              </View>
            </Pressable>
          ))
        )}
        {ingredients.length ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.hairline }}>
            <T w={800} size={14} color={t.text2}>
              Whole dish · raw {summed} g
            </T>
            <T num w={800} size={18}>
              {Math.round(totals.kcal)} kcal
            </T>
          </View>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <NumberField label="Cooked weight" value={cookedWeight || String(summed || 0)} unit="g" active={active === 'cooked'} onPress={() => focus('cooked')} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="You ate" value={portion} unit="g" active={active === 'ate'} onPress={() => focus('ate')} />
        </View>
      </View>
      <View style={{ marginBottom: 14 }}>
        <NumberPad onKey={pressNum} keyHeight={50} />
      </View>
      <T w={600} size={12} color={t.text3} style={{ marginTop: -2, marginBottom: 14 }}>
        Cooked weight defaults to the raw total — weigh the finished dish if water cooked off.
      </T>

      {ingredients.length && ateGrams > 0 ? (
        <Card pad={20} style={{ marginBottom: 16, backgroundColor: t.accentSofter }}>
          <SectionLabel>You ate</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <T num w={800} size={40} color={t.accentPress}>
              {ateKcal}
            </T>
            <T w={800} size={16} color={t.text2}>
              kcal
            </T>
          </View>
          <T w={700} size={13} color={t.text2} style={{ marginTop: 4 }}>
            {ateGrams} g of {cooked} g · {per100.kcal} kcal / 100 g
          </T>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <Button full size="lg" icon="check" onPress={logPortion}>
          Log this portion
        </Button>
        <Button full variant="soft" icon="star" onPress={saveDish}>
          Save dish to my foods
        </Button>
      </View>
      <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginTop: 12 }}>
        Tip: long-press an ingredient to remove it. Saved dishes can be logged again from Favorites.
      </T>

      <IngredientPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={addIngredient} />
    </Screen>
  );
}

function offToPick(o: OffFood): Pick {
  return { name: o.name, kcal_100g: o.kcal_100g, protein_100g: o.protein_100g, carb_100g: o.carb_100g, fat_100g: o.fat_100g };
}
function foodToPick(f: Food): Pick {
  return { name: f.name, kcal_100g: f.kcal_100g, protein_100g: f.protein_100g, carb_100g: f.carb_100g, fat_100g: f.fat_100g };
}

function IngredientPicker({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (p: Pick, grams: number) => void }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<Pick | null>(null);
  const gramsPad = useNumberField('');
  const [manual, setManual] = useState(false);
  const [mName, setMName] = useState('');
  const [mKcal, setMKcal] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(id);
  }, [text]);
  const off = useQuery({ queryKey: ['off', q], queryFn: () => api.off.search(q), enabled: visible && q.length >= 2 });
  const foods = useQuery({ queryKey: ['foods', 'all'], queryFn: () => api.foods.list(), enabled: visible });

  const reset = () => {
    setPending(null);
    gramsPad.reset('');
    setManual(false);
    setMName('');
    setMKcal('');
  };
  const confirmAdd = () => {
    const g = Number(gramsPad.value) || 0;
    if (!g) return;
    if (manual) {
      if (!mName.trim()) return;
      onAdd({ name: mName.trim(), kcal_100g: Number(mKcal) || 0, protein_100g: 0, carb_100g: 0, fat_100g: 0 }, g);
    } else if (pending) {
      onAdd(pending, g);
    }
    reset();
  };

  const Row = ({ name, sub, onPress }: { name: string; sub: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.hairline }}>
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="food" size={20} color={t.text3} />
      </View>
      <View style={{ flex: 1 }}>
        <T w={800} size={15} numberOfLines={1}>
          {name}
        </T>
        <T w={700} size={12} color={t.text3}>
          {sub}
        </T>
      </View>
      <Icon name="plus" size={18} stroke={2.6} color={t.accentPress} />
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={() => { reset(); onClose(); }} title="Add ingredient">
      {pending || manual ? (
        <View>
          <T w={800} size={17} style={{ marginBottom: 12 }}>
            {manual ? 'Manual ingredient' : pending?.name}
          </T>
          {manual ? (
            <>
              <TextField label="Name" value={mName} onChangeText={setMName} placeholder="e.g. Olive oil" autoFocus />
              <TextField label="Calories per 100 g" value={mKcal} onChangeText={setMKcal} keyboardType="numeric" suffix="kcal" />
            </>
          ) : null}
          <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            Amount used
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.hairline, borderRadius: 13, paddingHorizontal: 14, marginBottom: 12 }}>
            <T num w={800} size={22} color={t.text} style={{ flex: 1, paddingVertical: 12 }}>
              {gramsPad.value || '0'}
            </T>
            <T w={700} size={13} color={t.text3}>
              grams
            </T>
          </View>
          <View style={{ marginBottom: 14 }}>
            <NumberPad onKey={gramsPad.press} keyHeight={50} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button full variant="ghost" onPress={reset}>
                Back
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button full icon="check" onPress={confirmAdd}>
                Add
              </Button>
            </View>
          </View>
        </View>
      ) : (
        <View>
          <TextField label="Search foods" value={text} onChangeText={setText} placeholder="e.g. chicken thigh" autoFocus />
          {q.length >= 2 && off.data?.length ? (
            <>
              <SectionLabel style={{ marginBottom: 6 }}>Results · per 100 g</SectionLabel>
              {off.data.slice(0, 10).map((rr, i) => <Row key={`o-${i}`} name={rr.name} sub={`${rr.brand ? `${rr.brand} · ` : ''}${Math.round(rr.kcal_100g)} kcal`} onPress={() => setPending(offToPick(rr))} />)}
            </>
          ) : null}
          {foods.data?.length ? (
            <>
              <SectionLabel style={{ marginBottom: 6, marginTop: 12 }}>Your foods</SectionLabel>
              {foods.data.slice(0, 8).map((f) => <Row key={`f-${f.id}`} name={f.name} sub={`${Math.round(f.kcal_100g)} kcal / 100 g`} onPress={() => setPending(foodToPick(f))} />)}
            </>
          ) : null}
          <Pressable onPress={() => setManual(true)} style={{ alignItems: 'center', paddingVertical: 16 }}>
            <T w={800} size={14} color={t.text3}>
              Enter manually instead
            </T>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}
