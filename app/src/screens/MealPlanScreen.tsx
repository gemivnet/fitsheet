// MealPlanScreen.tsx — a saved, editable meal plan. Tap a meal to see what it is and log it;
// lock the ones you like and regenerate the rest; steer it with a note; add your own meals.

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, Icon, NumberPad, Screen, ScreenHeader, SectionLabel, SegmentedControl, Sheet, showToast, T, TextField, useNumberField } from '../components';
import { api, apiBase, type MealPlan, type PlannedMeal } from '../lib/api';
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
  const [streaming, setStreaming] = useState(false);
  const [streamNames, setStreamNames] = useState<string[]>([]);

  const setPlan = (p: MealPlan | null) => qc.setQueryData(['meal-plan'], { plan: p });
  const save = useMutation({ mutationFn: (p: MealPlan) => api.ai.mealPlan.save(p), onSuccess: (out) => setPlan(out.plan) });

  // Generate with live progress — meals pop in as Marmalade writes them, then the final plan saves.
  const generate = async () => {
    if (streaming) return;
    const body = JSON.stringify({ days: Number(days) || 7, guidance: guidance.trim(), keepIds: lockedIds(plan) });
    setStreaming(true);
    setStreamNames([]);
    try {
      const res = await fetch(`${apiBase}/api/ai/meal-plan-stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (res.status === 503) {
        showToast('AI is off on the server', { kind: 'error' });
        return;
      }
      const reader = (res as unknown as { body?: { getReader?: () => ReadableStreamDefaultReader<Uint8Array> } }).body?.getReader?.();
      if (!reader) {
        // browser can't read the stream — fall back to the plain endpoint
        const out = await api.ai.mealPlan.generate({ days: Number(days) || 7, guidance: guidance.trim(), keepIds: lockedIds(plan) });
        setPlan(out.plan);
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
          let msg: { t?: string; done?: boolean; plan?: MealPlan; error?: string };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (typeof msg.t === 'string') {
            text += msg.t;
            for (const m of text.matchAll(/"name"\s*:\s*"([^"]+)"/g)) {
              if (!seen.has(m[1])) {
                seen.add(m[1]);
                setStreamNames((a) => [...a, m[1]]);
              }
            }
          }
          if (msg.done && msg.plan) setPlan(msg.plan);
          if (msg.error) showToast('Couldn’t plan that — try again', { kind: 'error' });
        }
      }
    } catch {
      showToast('Couldn’t plan that — try again', { kind: 'error' });
    } finally {
      setStreaming(false);
    }
  };

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
      <ScreenHeader title="Meal plan" onBack={() => nav.goBack()} />

      {/* controls */}
      <Card pad={16} style={{ marginBottom: 16 }}>
        <SectionLabel style={{ marginBottom: 8 }}>Days</SectionLabel>
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
        <Button full size="lg" icon="food" onPress={generate}>
          {streaming ? 'Planning…' : plan ? (lockedCount ? `Regenerate (keep ${lockedCount} locked)` : 'Regenerate') : 'Generate plan'}
        </Button>
        {plan && !streaming ? (
          <T w={600} size={12} color={t.text3} style={{ marginTop: 8, textAlign: 'center' }}>
            Tap a meal to see it & log it · lock the keepers before you regenerate
          </T>
        ) : null}
      </Card>

      {/* live progress — meals pop in as they're generated */}
      {streaming ? (
        <Card pad={16} style={{ marginBottom: 16 }}>
          <T w={800} size={14} style={{ marginBottom: streamNames.length ? 10 : 0 }}>
            Marmalade is planning… {streamNames.length ? `${streamNames.length} meals so far` : ''}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {streamNames.map((n, i) => (
              <View key={i} style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.accentSoft }}>
                <T w={700} size={12} color={t.accentPress}>
                  {n}
                </T>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {!streaming && plan?.days?.length ? (
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
              <Pressable onPress={() => setAddDay(dayIdx)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 10, paddingBottom: 4 }}>
                <Icon name="plus" size={15} stroke={2.6} color={t.accentPress} />
                <T w={800} size={13} color={t.accentPress}>
                  Add a meal
                </T>
              </Pressable>
            </Card>
          );
        })
      ) : !streaming && !planQ.isLoading ? (
        <EmptyState
          icon="food"
          title="No plan yet"
          body="Set the days, add any instructions, and tap Generate. Meals come with ingredients and a quick method, and stay saved so you can tweak them."
        />
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
          <SectionLabel style={{ marginBottom: 6 }}>Ingredients</SectionLabel>
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
          <SectionLabel style={{ marginBottom: 6 }}>How to make it</SectionLabel>
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
      <SectionLabel style={{ marginBottom: 8 }}>Meal</SectionLabel>
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
