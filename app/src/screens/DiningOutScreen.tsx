// DiningOutScreen.tsx — log a fast-food / restaurant meal. Pick a place, re-log a saved order, or
// have the AI pull the chain's published nutrition and break the order into toggleable components
// ("build your item"). Parses are cached locally, and everything logged here is tagged "eating out".

import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, Icon, Screen, SectionLabel, T, TextField } from '../components';
import { api, type Food, type RestaurantItem } from '../lib/api';
import { notify } from '../lib/dialog';
import { useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

const MEALS: { key: string; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

type Props = NativeStackScreenProps<FoodStackParams, 'DiningOut'>;

export function DiningOutScreen({ navigation, route }: Props) {
  const t = useTheme();
  const qc = useQueryClient();
  const { date } = route.params;
  const [slot, setSlot] = useState(route.params.slot);
  const [restaurant, setRestaurant] = useState('');
  const [item, setItem] = useState('');
  const [built, setBuilt] = useState<RestaurantItem | null>(null);
  const [on, setOn] = useState<boolean[]>([]);
  const [orderName, setOrderName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rest = restaurant.trim();
  const restaurants = useQuery({ queryKey: ['restaurants'], queryFn: api.foods.restaurants });
  const saved = useQuery({ queryKey: ['dining', rest], queryFn: () => api.foods.dining(rest), enabled: rest.length > 0 });
  const menu = useQuery({ queryKey: ['restaurant-menu', rest], queryFn: () => api.ai.restaurantMenu(rest), enabled: rest.length > 0 });

  const load = (ri: RestaurantItem) => {
    setBuilt(ri);
    setOn(ri.components.map((c) => c.default_on));
    setOrderName(ri.name);
    setError(null);
  };

  const build = useMutation({
    mutationFn: () => api.ai.restaurantItem(rest, item.trim()),
    onSuccess: (out) => {
      if (!out.item) {
        setError(out.error === 'no_api_key' ? 'AI is off — add ANTHROPIC_API_KEY on the server.' : 'Couldn’t build that — try naming the item differently.');
        setBuilt(null);
        return;
      }
      load(out.item);
      qc.invalidateQueries({ queryKey: ['restaurant-menu', rest] });
    },
    onError: (e: any) => setError(e?.status === 503 ? 'AI is off — add ANTHROPIC_API_KEY on the server.' : 'Couldn’t reach the server.'),
  });

  const totals = useMemo(() => {
    const base = { grams: 0, kcal: 0, protein: 0, carb: 0, fat: 0 };
    if (!built) return base;
    return built.components.reduce(
      (a, c, i) => (on[i] ? { grams: a.grams + c.grams, kcal: a.kcal + c.kcal, protein: a.protein + c.protein_g, carb: a.carb + c.carb_g, fat: a.fat + c.fat_g } : a),
      base,
    );
  }, [built, on]);

  const macros100 = {
    kcal_100g: totals.grams > 0 ? Math.round((totals.kcal / totals.grams) * 100) : 0,
    protein_100g: totals.grams > 0 ? Math.round((totals.protein / totals.grams) * 1000) / 10 : 0,
    carb_100g: totals.grams > 0 ? Math.round((totals.carb / totals.grams) * 1000) / 10 : 0,
    fat_100g: totals.grams > 0 ? Math.round((totals.fat / totals.grams) * 1000) / 10 : 0,
  };
  const canLog = totals.kcal > 0 && totals.grams > 0;

  const logBuilt = async () => {
    if (!canLog) return;
    await api.foodLog.add({ date, meal_slot: slot, name: `${rest} · ${orderName}`, grams: totals.grams, eating_out: 1, ...macros100 });
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    navigation.goBack();
  };
  const saveOrder = async () => {
    if (!canLog) return;
    await api.foods.create({
      name: orderName || item.trim() || 'Order',
      restaurant: rest,
      eating_out: 1,
      source: 'dining',
      serving_g: totals.grams,
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
    navigation.goBack();
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 14 }}>
        <T w={800} size={26}>
          Dining out 🍔
        </T>
        <Pressable onPress={() => navigation.goBack()}>
          <T w={800} size={16} color={t.accentPress}>
            Cancel
          </T>
        </Pressable>
      </View>

      {/* meal */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {MEALS.map((m) => (
          <Chip key={m.key} active={slot === m.key} onPress={() => setSlot(m.key)}>
            {m.label}
          </Chip>
        ))}
      </View>

      {/* restaurant */}
      <TextField label="Restaurant" value={restaurant} onChangeText={setRestaurant} placeholder="e.g. Chipotle, McDonald's" autoFocus />
      {restaurants.data && restaurants.data.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 14 }}>
          {restaurants.data.map((r) => (
            <Chip key={r.restaurant} active={rest.toLowerCase() === r.restaurant.toLowerCase()} onPress={() => setRestaurant(r.restaurant)}>
              {r.restaurant}
            </Chip>
          ))}
        </View>
      ) : null}

      {rest.length > 0 ? (
        <>
          {/* saved orders */}
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

          {/* build an item with the AI / cached menu */}
          <SectionLabel style={{ marginBottom: 10 }}>Build an item</SectionLabel>
          <TextField label={undefined} value={item} onChangeText={setItem} placeholder="What are you getting? e.g. chicken burrito bowl" />
          <Button full icon="star" onPress={() => build.mutate()}>
            {build.isPending ? 'Pulling nutrition…' : 'Build it'}
          </Button>

          {menu.data && menu.data.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {menu.data.map((m) => (
                <Chip key={m.id} icon="food" onPress={() => load(m)}>
                  {m.name}
                </Chip>
              ))}
            </View>
          ) : null}

          {error ? (
            <T w={700} size={14} color={t.caution} style={{ marginTop: 12 }}>
              {error}
            </T>
          ) : null}

          {built ? (
            <View style={{ marginTop: 16 }}>
              <Card pad={6}>
                {built.components.map((c, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setOn((xs) => xs.map((v, idx) => (idx === i ? !v : v)))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: i === built.components.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: on[i] ? t.accent : 'transparent', borderWidth: on[i] ? 0 : 1.8, borderColor: t.hairline }}>
                      {on[i] ? <Icon name="check" size={15} stroke={3} color="#fff" /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w={700} size={15} color={on[i] ? t.text : t.text3} numberOfLines={1}>
                        {c.name}
                      </T>
                    </View>
                    <T num w={800} size={15} color={on[i] ? t.text : t.text3}>
                      {c.kcal}
                    </T>
                  </Pressable>
                ))}
              </Card>

              <Card pad={18} style={{ marginTop: 12, backgroundColor: t.accentSofter }}>
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
                <Button full size="lg" icon="check" onPress={logBuilt}>
                  Log to {MEALS.find((m) => m.key === slot)?.label ?? slot}
                </Button>
                <Button full variant="soft" icon="star" onPress={saveOrder}>
                  Save this order
                </Button>
              </View>
            </View>
          ) : null}
        </>
      ) : (
        <T w={600} size={14} color={t.text3} style={{ padding: 8 }}>
          Pick a restaurant to see your saved orders or build a new one.
        </T>
      )}

      <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginTop: 16, lineHeight: 18 }}>
        Numbers come from the chain&rsquo;s published nutrition and are saved on your server — edit a
        logged item any time from the day&rsquo;s log.
      </T>
    </Screen>
  );
}
