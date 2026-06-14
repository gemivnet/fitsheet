// MealPlanScreen.tsx — a saved, editable meal plan. Tap a meal to see what it is and log it;
// lock the ones you like and regenerate the rest; steer it with a note; add your own meals.

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, Icon, NumberPad, Screen, SegmentedControl, Sheet, showToast, T, TextField, useNumberField } from '../components';
import { api, type MealPlan, type PlannedMeal, type WeeklyGoal } from '../lib/api';
import { todayStr } from '../lib/date';
import { useTheme } from '../theme';

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const dayKcal = (meals: PlannedMeal[]) => meals.reduce((a, m) => a + (m.kcal || 0), 0);

export function MealPlanScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const planQ = useQuery({ queryKey: ['meal-plan'], queryFn: api.ai.mealPlan.get });
  const goal = settings.data?.daily_calorie_goal ?? 0;
  const plan = planQ.data?.plan ?? null;

  const [days, setDays] = useState('7');
  const [guidance, setGuidance] = useState('');
  const [detail, setDetail] = useState<{ dayIdx: number; meal: PlannedMeal } | null>(null);
  const [addDay, setAddDay] = useState<number | null>(null);

  const setPlan = (p: MealPlan | null) => qc.setQueryData(['meal-plan'], { plan: p });
  const generate = useMutation({
    mutationFn: () => api.ai.mealPlan.generate({ days: Number(days) || 7, guidance: guidance.trim(), keepIds: lockedIds(plan) }),
    onSuccess: (out) => setPlan(out.plan),
    meta: { suppressErrorToast: true },
  });
  const save = useMutation({ mutationFn: (p: MealPlan) => api.ai.mealPlan.save(p), onSuccess: (out) => setPlan(out.plan) });

  // edits operate on the saved plan and persist the whole thing
  const mutateMeals = (dayIdx: number, fn: (meals: PlannedMeal[]) => PlannedMeal[]) => {
    if (!plan) return;
    const next: MealPlan = { ...plan, days: plan.days.map((d, i) => (i === dayIdx ? { ...d, meals: fn(d.meals) } : d)) };
    save.mutate(next);
  };
  const toggleLock = (dayIdx: number, id: string) => mutateMeals(dayIdx, (ms) => ms.map((m) => (m.id === id ? { ...m, locked: !m.locked } : m)));
  const removeMeal = (dayIdx: number, id: string) => mutateMeals(dayIdx, (ms) => ms.filter((m) => m.id !== id));

  const log = useMutation({
    mutationFn: (m: PlannedMeal) =>
      api.foodLog.add({
        date: todayStr(),
        meal_slot: SLOTS.includes(m.slot) ? m.slot : 'snacks',
        name: m.name,
        grams: 100,
        kcal_100g: m.kcal,
        protein_100g: m.protein_g,
        carb_100g: m.carb_g,
        fat_100g: m.fat_g,
        auto_food: false, // plan ideas shouldn't flood her foods library
      }),
    onSuccess: (_d, m) => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['foodlog'] });
      showToast(`${m.name} logged for today`);
    },
  });

  const lockedCount = plan ? plan.days.flatMap((d) => d.meals).filter((m) => m.locked).length : 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 16 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="chevL" size={26} color={t.text2} />
        </Pressable>
        <T w={800} size={30}>
          Meal plan
        </T>
      </View>

      <WeeklyGoalsCard />

      {/* controls */}
      <Card pad={16} style={{ marginBottom: 16 }}>
        <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
          Days
        </T>
        <View style={{ marginBottom: 12 }}>
          <SegmentedControl options={['3', '5', '7']} value={days} onChange={setDays} />
        </View>
        <TextField
          label="Tell Marmalade how to plan (optional)"
          value={guidance}
          onChangeText={setGuidance}
          placeholder="e.g. scrambled eggs every other day instead of grits"
          multiline
        />
        <Button full size="lg" icon="food" onPress={() => generate.mutate()}>
          {generate.isPending ? 'Planning…' : plan ? (lockedCount ? `Regenerate (keep ${lockedCount} locked)` : 'Regenerate') : 'Generate plan'}
        </Button>
        {plan ? (
          <T w={600} size={12} color={t.text3} style={{ marginTop: 8, textAlign: 'center' }}>
            Tap a meal to see it & log it · lock the keepers before you regenerate
          </T>
        ) : null}
      </Card>

      {generate.isError ? (
        <T w={700} color={t.caution} style={{ marginBottom: 14 }}>
          Couldn&rsquo;t plan that — try again in a moment.
        </T>
      ) : null}

      {plan?.days?.length ? (
        plan.days.map((d, dayIdx) => {
          const total = dayKcal(d.meals);
          return (
            <Card key={dayIdx} pad={14} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <T w={800} size={17}>
                  {d.label}
                </T>
                <T num w={800} size={15} color={!goal || total <= goal ? t.success : t.caution}>
                  {total} kcal
                </T>
              </View>
              {d.meals.map((m, j) => (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: j === d.meals.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
                  <Pressable onPress={() => toggleLock(dayIdx, m.id)} hitSlop={8}>
                    <Icon name={m.locked ? 'check' : 'plus'} size={16} stroke={2.6} color={m.locked ? t.success : t.text3} />
                  </Pressable>
                  <Pressable onPress={() => setDetail({ dayIdx, meal: m })} style={{ flex: 1, minWidth: 0 }}>
                    <T w={700} size={12} color={t.text3} style={{ textTransform: 'capitalize' }}>
                      {m.slot}
                      {m.locked ? ' · locked' : ''}
                    </T>
                    <T w={700} size={15} numberOfLines={1}>
                      {m.name}
                    </T>
                  </Pressable>
                  <T num w={800} size={14} color={t.text2}>
                    {m.kcal}
                  </T>
                  <Pressable onPress={() => log.mutate(m)} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 999, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="plus" size={17} stroke={2.6} color={t.accentPress} />
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={() => setAddDay(dayIdx)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 10 }}>
                <Icon name="plus" size={15} stroke={2.6} color={t.accentPress} />
                <T w={800} size={13} color={t.accentPress}>
                  Add a meal
                </T>
              </Pressable>
            </Card>
          );
        })
      ) : !planQ.isLoading ? (
        <T w={600} size={14} color={t.text2} style={{ lineHeight: 20 }}>
          No plan yet — set the days, add any instructions, and tap Generate. Meals come with ingredients and a quick method, and stay saved so you can tweak them.
        </T>
      ) : null}

      <View style={{ height: 20 }} />

      <MealDetailSheet
        entry={detail}
        onClose={() => setDetail(null)}
        onLog={(m) => {
          log.mutate(m);
          setDetail(null);
        }}
        onRemove={(dayIdx, id) => {
          removeMeal(dayIdx, id);
          setDetail(null);
        }}
      />
      <AddMealSheet
        dayIdx={addDay}
        onClose={() => setAddDay(null)}
        onAdd={(dayIdx, meal) => {
          mutateMeals(dayIdx, (ms) => [...ms, meal]);
          setAddDay(null);
        }}
      />
    </Screen>
  );
}

function lockedIds(plan: MealPlan | null): string[] {
  if (!plan) return [];
  return plan.days.flatMap((d) => d.meals).filter((m) => m.locked).map((m) => m.id);
}

function WeeklyGoalsCard() {
  const t = useTheme();
  const qc = useQueryClient();
  const date = todayStr();
  const q = useQuery({ queryKey: ['weekly-goals', date], queryFn: () => api.ai.weeklyGoals.get(date) });
  const items = q.data?.items ?? [];
  const set = (its: WeeklyGoal[]) => qc.setQueryData(['weekly-goals', date], { items: its });
  const save = useMutation({ mutationFn: (its: WeeklyGoal[]) => api.ai.weeklyGoals.save(its, date), onSuccess: (out) => set(out.items) });
  const suggest = useMutation({ mutationFn: () => api.ai.weeklyGoals.suggest(date), onSuccess: (out) => set(out.items), meta: { suppressErrorToast: true } });
  const [adding, setAdding] = useState('');

  const toggle = (g: WeeklyGoal) => {
    if (g.auto) return; // auto goals tick themselves
    save.mutate(items.map((i) => (i.id === g.id ? { ...i, done: !i.done } : i)));
  };
  const remove = (g: WeeklyGoal) => save.mutate(items.filter((i) => i.id !== g.id));
  const addOwn = () => {
    if (!adding.trim()) return;
    save.mutate([...items, { id: `g-${Date.now()}`, text: adding.trim(), source: 'me', auto: null, target: 0, done: false }]);
    setAdding('');
  };
  const done = items.filter((i) => i.done).length;

  return (
    <Card pad={16} style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: items.length ? 8 : 4 }}>
        <T w={800} size={16}>
          This week{items.length ? ` · ${done}/${items.length}` : ''}
        </T>
        <Pressable onPress={() => suggest.mutate()} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="star" size={15} color={t.accentPress} />
          <T w={800} size={13} color={t.accentPress}>
            {suggest.isPending ? 'Thinking…' : 'Suggest'}
          </T>
        </Pressable>
      </View>

      {items.map((g) => (
        <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <Pressable onPress={() => toggle(g)} hitSlop={6} disabled={!!g.auto}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: g.done ? t.success : 'transparent',
                borderWidth: g.done ? 0 : 1.8,
                borderColor: t.hairline,
              }}
            >
              {g.done ? <Icon name="check" size={15} stroke={3} color="#fff" /> : null}
            </View>
          </Pressable>
          <T w={700} size={15} color={g.done ? t.text3 : t.text} style={{ flex: 1, textDecorationLine: g.done ? 'line-through' : 'none' }}>
            {g.text}
          </T>
          {g.auto ? (
            <View style={{ backgroundColor: t.surface2, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999 }}>
              <T w={800} size={10} color={t.text3}>
                AUTO
              </T>
            </View>
          ) : (
            <Pressable onPress={() => remove(g)} hitSlop={8}>
              <T w={800} size={18} color={t.text3}>
                ×
              </T>
            </Pressable>
          )}
        </View>
      ))}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: items.length ? 8 : 0 }}>
        <View style={{ flex: 1 }}>
          <TextField value={adding} onChangeText={setAdding} placeholder="Add your own goal…" />
        </View>
        <Pressable onPress={addOwn} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: adding.trim() ? t.accent : t.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Icon name="plus" size={20} stroke={2.8} color={adding.trim() ? '#fff' : t.text3} />
        </Pressable>
      </View>
    </Card>
  );
}

function MealDetailSheet({
  entry,
  onClose,
  onLog,
  onRemove,
}: {
  entry: { dayIdx: number; meal: PlannedMeal } | null;
  onClose: () => void;
  onLog: (m: PlannedMeal) => void;
  onRemove: (dayIdx: number, id: string) => void;
}) {
  const t = useTheme();
  if (!entry) return null;
  const m = entry.meal;
  return (
    <Sheet visible={!!entry} onClose={onClose} title={m.name}>
      <T w={700} size={13} color={t.text3} style={{ textTransform: 'capitalize', marginTop: -6, marginBottom: 12 }}>
        {m.slot} · {m.kcal} kcal · P {Math.round(m.protein_g)} · C {Math.round(m.carb_g)} · F {Math.round(m.fat_g)} g
      </T>
      {m.ingredients?.length ? (
        <>
          <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            Ingredients
          </T>
          <View style={{ marginBottom: 14 }}>
            {m.ingredients.map((ing, i) => (
              <T key={i} w={600} size={15} color={t.text2} style={{ lineHeight: 22 }}>
                • {ing}
              </T>
            ))}
          </View>
        </>
      ) : null}
      {m.steps ? (
        <>
          <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            How to make it
          </T>
          <T w={600} size={15} color={t.text2} style={{ lineHeight: 22, marginBottom: 16 }}>
            {m.steps}
          </T>
        </>
      ) : null}
      <Button full size="lg" icon="plus" onPress={() => onLog(m)}>
        Log it to today
      </Button>
      <Pressable onPress={() => onRemove(entry.dayIdx, m.id)} style={{ alignItems: 'center', paddingVertical: 14 }}>
        <T w={800} size={15} color={t.caution}>
          Remove from plan
        </T>
      </Pressable>
    </Sheet>
  );
}

function AddMealSheet({ dayIdx, onClose, onAdd }: { dayIdx: number | null; onClose: () => void; onAdd: (dayIdx: number, meal: PlannedMeal) => void }) {
  const t = useTheme();
  const [name, setName] = useState('');
  const [slot, setSlot] = useState('dinner');
  const kcal = useNumberField('');
  React.useEffect(() => {
    if (dayIdx != null) {
      setName('');
      setSlot('dinner');
      kcal.reset('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIdx]);
  if (dayIdx == null) return null;
  const k = Number(kcal.value) || 0;
  const add = () => {
    if (!name.trim()) return;
    onAdd(dayIdx, {
      id: `m-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      slot,
      name: name.trim(),
      kcal: k,
      protein_g: 0,
      carb_g: 0,
      fat_g: 0,
      ingredients: [],
      steps: '',
      locked: true, // a meal she added by hand should stick through regenerates
    });
  };
  return (
    <Sheet visible={dayIdx != null} onClose={onClose} title="Add a meal">
      <TextField label="What is it?" value={name} onChangeText={setName} placeholder="e.g. Greek yogurt + berries" autoFocus />
      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Meal
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {SLOTS.map((s) => (
          <Chip key={s} active={slot === s} onPress={() => setSlot(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Chip>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
        <T num w={800} size={28}>
          {kcal.value || '0'}
        </T>
        <T w={800} size={15} color={t.text3}>
          kcal
        </T>
      </View>
      <View style={{ marginBottom: 16 }}>
        <NumberPad onKey={kcal.press} />
      </View>
      <Button full size="lg" icon="check" onPress={add}>
        Add to plan
      </Button>
    </Sheet>
  );
}
