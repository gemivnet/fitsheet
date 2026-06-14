// HomeScreen.tsx — the live dashboard. Tap a favorite to log it; the ring fills + a toast confirms.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applyNumberKey, BankLine, Button, CalorieRing, Card, CelebrationModal, Checkbox, Icon, MacroBar, NumberPad, ProgressBar, Screen, SectionLabel, Sheet, showToast, T } from '../components';
import { api, type Suggestion, type SupplementToday, type UsualMeal } from '../lib/api';
import { DAY_UNDER_GOAL, FIRST_LOG_OF_DAY, pick, WORKOUT_DONE } from '../lib/encouragement';
import { slotForNow, todayStr } from '../lib/date';
import { fmtWeight } from '../lib/units';
import { useTheme } from '../theme';
import type { RootTabParams } from '../navigation/types';

type Nav = BottomTabNavigationProp<RootTabParams, 'Home'>;

const MEALS: { key: string; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

export function HomeScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();

  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const curSlot = slotForNow();
  const usual = useQuery({ queryKey: ['usual', curSlot, todayStr()], queryFn: () => api.foodLog.usual(curSlot, todayStr()) });

  // End-of-day recap — only fetch (and generate) once dinner's logged or it's evening, with food in.
  const dToday = dash.data?.today;
  const showRecap = !!dToday && dToday.totals.kcal > 0 && ((dToday.slots?.dinner ?? []).length > 0 || !!dToday.slots_complete?.dinner || new Date().getHours() >= 19);
  const recap = useQuery({ queryKey: ['day-summary', todayStr()], queryFn: () => api.ai.daySummary(todayStr()), enabled: showRecap, staleTime: 30 * 60 * 1000 });

  useFocusEffect(useCallback(() => void dash.refetch(), [dash.refetch]));

  const complete = useMutation({
    mutationFn: (id: number) => api.workouts.complete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      showToast(pick(WORKOUT_DONE));
    },
  });

  const ackMilestone = useMutation({
    mutationFn: (id: number) => api.weight.ackMilestone(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const snooze = useMutation({
    mutationFn: (on: boolean) => api.foodLog.snooze(todayStr(), on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const mealComplete = useMutation({
    mutationFn: (p: { slot: string; on: boolean }) => api.foodLog.mealComplete(todayStr(), p.slot, p.on),
    onSuccess: (sum, p) => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // closing out dinner is the natural moment for a fresh recap — and a small cheer when it landed under goal
      if (p.slot === 'dinner' && p.on) {
        qc.invalidateQueries({ queryKey: ['day-summary'] });
        const left = sum.banking ? sum.adjusted_remaining : sum.remaining;
        if (sum.totals.kcal > 0 && left >= 0) showToast(pick(DAY_UNDER_GOAL));
      }
    },
  });

  const addTo = (slot: string) => nav.navigate('Food', { screen: 'AddFood', params: { slot, date: todayStr() } });

  if (dash.isLoading || !dash.data) {
    return (
      <Screen>
        <View style={{ paddingTop: 80, alignItems: 'center' }}>
          <T w={700} color={t.text3}>
            {dash.isError ? "Can't reach the server — is it running?" : 'Loading…'}
          </T>
        </View>
      </Screen>
    );
  }

  const d = dash.data;
  const s = d.settings;
  const today = d.today;
  const banking = today.banking;
  const target = banking ? today.adjusted_goal : today.goal;
  const remaining = banking ? today.adjusted_remaining : today.remaining;
  const over = today.totals.kcal > target;
  const goal = d.weight.goal;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {/* greeting */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 18 }}>
          <View>
            <T w={700} size={16} color={t.text2}>
              {greeting()}
            </T>
            <T w={800} size={30} style={{ letterSpacing: -0.5 }}>
              Hi, {s.display_name}
            </T>
          </View>
          <View style={[{ width: 50, height: 50, borderRadius: 999, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }, t.shadowSm]}>
            <Icon name="bell" size={24} color={t.text2} />
          </View>
        </View>

        {/* Once the day's recap is ready it's the exclusive top card; otherwise the check-in + usual meal show. */}
        {recap.data?.note ? (
          <Card pad={18} style={{ marginBottom: 16, backgroundColor: t.accentSofter }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trend" size={16} stroke={2.4} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <SectionLabel style={{ marginBottom: 4 }}>Today&rsquo;s recap</SectionLabel>
                <T w={700} size={15} style={{ lineHeight: 22 }}>
                  {recap.data.note}
                </T>
              </View>
            </View>
          </Card>
        ) : (
          <>
            <CheckinCard />
            {usual.data?.found && (today.slots?.[usual.data.slot] ?? []).length === 0 ? (
              <UsualMealCard meal={usual.data} />
            ) : (today.slots?.[curSlot] ?? []).length === 0 ? (
              <QuickLogSuggestions slot={curSlot} onAdd={() => addTo(curSlot)} firstOfDay={today.totals.kcal === 0} />
            ) : null}
          </>
        )}

        {/* today's calories */}
        <Card pad={24} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <SectionLabel>Today&rsquo;s calories</SectionLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: over ? t.cautionSoft : t.successSoft }}>
              <Icon name={over ? 'flame' : 'check'} size={14} stroke={2.6} color={over ? t.caution : t.success} />
              <T w={800} size={13} color={over ? t.caution : t.success}>
                {over ? 'A bit over today' : 'On track'}
              </T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26 }}>
            <CalorieRing consumed={today.totals.kcal} goal={target} size={200} />
            <View style={{ flex: 1, gap: 14 }}>
              <Stat label="Eaten" value={Math.round(today.totals.kcal)} />
              <View style={{ height: 1, backgroundColor: t.hairline }} />
              <Stat label={banking ? 'Today’s target' : 'Goal'} value={target} />
              <View style={{ height: 1, backgroundColor: t.hairline }} />
              <Stat label="Left" value={remaining} muted />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 22 }}>
            <MacroBar label="Protein" value={Math.round(today.totals.protein)} goal={s.protein_goal_g} varName="pro" />
            <MacroBar label="Carbs" value={Math.round(today.totals.carb)} goal={s.carb_goal_g} varName="carb" />
            <MacroBar label="Fat" value={Math.round(today.totals.fat)} goal={s.fat_goal_g} varName="fat" />
          </View>
          {banking && (today.bank_week !== 0 || today.bank_snoozed) ? <BankLine day={today} onSnooze={(on) => snooze.mutate(on)} /> : null}
        </Card>

        {/* today's meals — split by time of day, each with a "complete" tick */}
        <Card pad={20} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <SectionLabel>Today&rsquo;s meals</SectionLabel>
            <Pressable onPress={() => nav.navigate('Food', { screen: 'FoodDay' })} hitSlop={8}>
              <T w={800} size={13} color={t.accentPress}>
                View day →
              </T>
            </Pressable>
          </View>
          {MEALS.map(({ key, label }, mi) => {
            const items = today.slots?.[key] ?? [];
            const sub = Math.round(today.slot_kcal?.[key] ?? 0);
            const done = !!today.slots_complete?.[key];
            return (
              <View key={key} style={{ paddingVertical: 10, borderBottomWidth: mi === MEALS.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Pressable onPress={() => mealComplete.mutate({ slot: key, on: !done })} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                    <Checkbox checked={done} size={22} />
                    <T w={800} size={15} color={done ? t.text3 : t.text}>
                      {label}
                    </T>
                    {sub ? (
                      <T num w={700} size={13} color={t.text3}>
                        {sub} kcal
                      </T>
                    ) : null}
                  </Pressable>
                  <Pressable onPress={() => addTo(key)} hitSlop={8} style={{ width: 38, height: 38, borderRadius: 999, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="plus" size={19} stroke={2.6} color={t.accentPress} />
                  </Pressable>
                </View>
                {items.map((it) => (
                  <Pressable
                    key={it.id}
                    onPress={() => nav.navigate('Food', { screen: 'FoodDay' })}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingLeft: 31 }}
                  >
                    <T w={700} size={14} color={t.text2} numberOfLines={1} style={{ flex: 1, paddingRight: 10 }}>
                      {it.name}
                      {it.eating_out ? ' 🍔' : ''} <T w={600} size={12} color={t.text3}>· {Math.round(it.grams)} g</T>
                    </T>
                    <T num w={800} size={14}>
                      {Math.round(it.kcal)}
                    </T>
                  </Pressable>
                ))}
              </View>
            );
          })}
          <View style={{ marginTop: 14 }}>
            <Button variant="soft" icon="plus" full onPress={() => addTo('snacks')}>
              Add as snack
            </Button>
          </View>
        </Card>

        <SupplementsCard />

        {/* weight goal + workout */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Card pad={20} style={{ flex: 1 }}>
            <SectionLabel style={{ marginBottom: 14 }}>Weight goal</SectionLabel>
            {goal.current_trend != null ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <T num w={800} size={34}>
                    {fmtWeight(goal.current_trend, s.units)}
                  </T>
                  <T w={800} size={15} color={t.text2}>
                    {s.units}
                  </T>
                  {goal.lost != null && goal.lost > 0 ? (
                    <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Icon name="trend" size={15} stroke={2.4} color={t.success} />
                      <T w={800} size={13} color={t.success}>
                        −{fmtWeight(goal.lost, s.units)}
                      </T>
                    </View>
                  ) : null}
                </View>
                {goal.pct != null ? (
                  <>
                    <T w={700} size={13} color={t.text2} style={{ marginBottom: 12 }}>
                      You&rsquo;re <T w={800} size={13} color={t.accentPress}>{goal.pct}% there</T>
                      {goal.remaining != null ? ` · ${fmtWeight(goal.remaining, s.units)} ${s.units} to go` : ''}
                    </T>
                    <ProgressBar value={goal.pct} max={100} height={10} />
                  </>
                ) : (
                  <T w={700} size={13} color={t.text3}>Set a target in Settings to track progress.</T>
                )}
              </>
            ) : (
              <Pressable onPress={() => nav.navigate('Weight', { screen: 'LogWeight' })}>
                <T w={700} size={14} color={t.text2}>Log your first weight to start tracking →</T>
              </Pressable>
            )}
          </Card>

          <Card pad={20} style={{ flex: 1 }}>
            <SectionLabel style={{ marginBottom: 14 }}>Today&rsquo;s workout</SectionLabel>
            {d.workout ? (
              <>
                <T w={800} size={18} style={{ marginBottom: 4 }} numberOfLines={2}>
                  {d.workout.title}
                </T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  <Icon name="activity" size={15} stroke={2.4} color={t.text2} />
                  <T w={700} size={13} color={t.text2}>
                    {d.workout.planned_minutes ? `${d.workout.planned_minutes} min` : 'Workout'}
                  </T>
                </View>
                <View style={{ flexDirection: 'row', gap: 9 }}>
                  {d.workout.external_url ? (
                    <View style={{ flex: 1 }}>
                      <Button variant="soft" icon="link" size="sm" full onPress={() => Linking.openURL(d.workout!.external_url!)}>
                        Open
                      </Button>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Button variant="success" icon="check" size="sm" full onPress={() => complete.mutate(d.workout!.id)}>
                      Done
                    </Button>
                  </View>
                </View>
              </>
            ) : (
              <T w={700} size={14} color={t.text3} style={{ paddingVertical: 8 }}>
                No workout planned today. Rest up or add one in Activity.
              </T>
            )}
          </Card>
        </View>
      </Screen>

      {d.milestone ? (
        d.milestone.kind === 'logging_streak' ? (
          <CelebrationModal
            visible
            kpi={`${d.milestone.threshold_lb}🔥`}
            title={`${d.milestone.threshold_lb} days in a row!`}
            body={`${d.milestone.threshold_lb >= 30 ? 'A whole month' : 'A whole week'} of showing up, ${s.display_name} — that's how habits stick.`}
            cta="Keep going!"
            onClose={() => ackMilestone.mutate(d.milestone!.id)}
          />
        ) : (
          <CelebrationModal
            visible
            kpi={`−${d.milestone.threshold_lb}`}
            title={`${d.milestone.threshold_lb} pounds down!`}
            body={`Amazing work, ${s.display_name} — your trend just crossed another milestone. Keep showing up.`}
            cta="Keep it up!"
            onClose={() => ackMilestone.mutate(d.milestone!.id)}
          />
        )
      ) : null}
    </View>
  );
}

function SupplementsCard() {
  const t = useTheme();
  const qc = useQueryClient();
  const date = todayStr();
  const q = useQuery({ queryKey: ['supplements-today', date], queryFn: () => api.supplements.today(date) });
  const toggle = useMutation({
    mutationFn: (p: { id: number; taken: boolean }) => api.supplements.toggle(p.id, date, p.taken),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: ['supplements-today', date] });
      const prev = qc.getQueryData<SupplementToday[]>(['supplements-today', date]);
      qc.setQueryData(['supplements-today', date], (xs?: SupplementToday[]) => (xs ?? []).map((x) => (x.id === p.id ? { ...x, taken: p.taken ? 1 : 0 } : x)));
      return { prev };
    },
    onError: (_e, _p, ctx) => qc.setQueryData(['supplements-today', date], ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['supplements-today', date] }),
  });
  const onToggle = (s: SupplementToday) => toggle.mutate({ id: s.id, taken: !s.taken });
  if (!q.data?.length) return null;
  const done = q.data.filter((s) => s.taken).length;
  return (
    <Card pad={20} style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionLabel>Vitamins &amp; meds</SectionLabel>
        <T num w={800} size={13} color={done === q.data.length ? t.success : t.text3}>
          {done}/{q.data.length} {done === q.data.length ? '✓' : ''}
        </T>
      </View>
      {q.data.map((s, i) => (
        <Pressable key={s.id} onPress={() => onToggle(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === q.data!.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
          <Checkbox checked={!!s.taken} />
          <T w={700} size={15} color={s.taken ? t.text3 : t.text} style={{ flex: 1, textDecorationLine: s.taken ? 'line-through' : 'none' }}>
            {s.name}
          </T>
        </Pressable>
      ))}
    </Card>
  );
}

function CheckinCard() {
  const t = useTheme();
  const c = useQuery({ queryKey: ['checkin'], queryFn: api.ai.checkin, staleTime: 60 * 60 * 1000 });
  if (!c.data?.note) return null;
  return (
    <Card pad={18} style={{ marginBottom: 16, backgroundColor: t.accentSofter }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="star" size={16} color="#fff" fill="#fff" />
        </View>
        <T w={700} size={15} style={{ flex: 1, lineHeight: 22 }}>
          {c.data.note}
        </T>
      </View>
    </Card>
  );
}

const SLOT_INVITE: Record<string, string> = { breakfast: 'What’s for breakfast?', lunch: 'What’s for lunch?', dinner: 'What’s for dinner?', snacks: 'Fancy a snack?' };

// One-tap logging of the foods she most likely wants right now (remembered amounts).
// With nothing to suggest yet (brand-new library), it becomes a friendly invitation instead.
function QuickLogSuggestions({ slot, onAdd, firstOfDay }: { slot: string; onAdd: () => void; firstOfDay: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const date = todayStr();
  const sugg = useQuery({ queryKey: ['foods', 'suggestions', slot, date], queryFn: () => api.foods.suggestions({ slot, date }) });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['foodlog'] });
    qc.invalidateQueries({ queryKey: ['foods'] });
    qc.invalidateQueries({ queryKey: ['usual'] });
  };
  const undo = useMutation({ mutationFn: (id: number) => api.foodLog.remove(id), onSuccess: invalidate });
  const add = useMutation({
    mutationFn: async (f: Suggestion) => {
      const grams = f.last_grams ?? f.serving_g ?? 100;
      const res = await api.foodLog.add({ date, meal_slot: slot, food_id: f.id, name: f.name, grams, kcal_100g: f.kcal_100g, protein_100g: f.protein_100g, carb_100g: f.carb_100g, fat_100g: f.fat_100g });
      const dayCount = Object.values(res.slots ?? {}).reduce((n, xs) => n + xs.length, 0);
      return { id: res.added_id, name: f.name, first: dayCount === 1 };
    },
    onSuccess: ({ id, name, first }) => {
      invalidate();
      showToast(first ? `${name} logged — ${pick(FIRST_LOG_OF_DAY)}` : `${name} logged`, { actionLabel: 'Undo', onAction: () => undo.mutate(id) });
    },
  });
  const top = (sugg.data ?? []).slice(0, 3);
  if (!top.length) {
    if (!firstOfDay || sugg.isLoading) return null;
    return (
      <Card pad={18} style={{ marginBottom: 16 }}>
        <T w={800} size={16} style={{ marginBottom: 4 }}>
          {SLOT_INVITE[slot] ?? 'What did you have?'}
        </T>
        <T w={600} size={13} color={t.text3} style={{ marginBottom: 12 }}>
          Nothing logged yet — it only takes a couple of taps.
        </T>
        <Button full icon="plus" onPress={onAdd}>
          Log {SLOT_NOUN[slot] ?? slot}
        </Button>
      </Card>
    );
  }
  return (
    <Card pad={18} style={{ marginBottom: 16 }}>
      <SectionLabel style={{ marginBottom: 2 }}>One tap to log · {SLOT_NOUN[slot] ?? slot}</SectionLabel>
      {top.map((f, i) => {
        const grams = f.last_grams ?? f.serving_g ?? 100;
        return (
          <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: i === top.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={800} size={15} numberOfLines={1}>
                {f.name}
              </T>
              <T w={700} size={12} color={t.text3} numberOfLines={1}>
                {Math.round(grams)} g · {Math.round((f.kcal_100g * grams) / 100)} kcal
                {f.reason ? ` · ${f.reason}` : ''}
              </T>
            </View>
            <Pressable onPress={() => add.mutate(f)} hitSlop={8} style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={22} stroke={2.8} color="#fff" />
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

const SLOT_NOUN: Record<string, string> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snacks: 'snack' };
type UsualLog = { food_id: number | null; name: string; grams: number; kcal_100g: number; protein_100g: number; carb_100g: number; fat_100g: number };

function UsualMealCard({ meal }: { meal: UsualMeal }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const total = Math.round(meal.items.reduce((a, it) => a + (it.kcal_100g * it.grams) / 100, 0));
  const logAll = async (items: UsualLog[]) => {
    let logged = 0;
    try {
      for (const it of items) {
        if (it.grams <= 0) continue;
        await api.foodLog.add({ date: todayStr(), meal_slot: meal.slot, food_id: it.food_id, name: it.name, grams: it.grams, kcal_100g: it.kcal_100g, protein_100g: it.protein_100g, carb_100g: it.carb_100g, fat_100g: it.fat_100g });
        logged++;
      }
      showToast(`Your usual ${SLOT_NOUN[meal.slot] ?? meal.slot} is logged ✓`);
    } catch {
      showToast(logged ? 'Only some of that saved — check the day view' : 'Couldn’t log that — try again', { kind: 'error' });
    }
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['usual'] });
    qc.invalidateQueries({ queryKey: ['foodlog'] });
  };
  return (
    <Card pad={18} style={{ marginBottom: 16, backgroundColor: t.accentSofter }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <SectionLabel>Having your usual {SLOT_NOUN[meal.slot] ?? meal.slot}?</SectionLabel>
        <T num w={800} size={15} color={t.accentPress}>
          {total} kcal
        </T>
      </View>
      <T w={700} size={14} color={t.text2} numberOfLines={2} style={{ marginBottom: 14, lineHeight: 20 }}>
        {meal.items.map((i) => i.name).join(' · ')}
      </T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button full icon="check" onPress={() => logAll(meal.items)}>
            Log it
          </Button>
        </View>
        <Button variant="soft" icon="edit" onPress={() => setOpen(true)}>
          Tweak
        </Button>
      </View>
      <UsualMealSheet
        visible={open}
        meal={meal}
        onClose={() => setOpen(false)}
        onLog={async (items) => {
          await logAll(items);
          setOpen(false);
        }}
      />
    </Card>
  );
}

type EditItem = { food_id: number | null; name: string; gramsStr: string; kcal_100g: number; protein_100g: number; carb_100g: number; fat_100g: number; on: boolean };

function UsualMealSheet({ visible, meal, onClose, onLog }: { visible: boolean; meal: UsualMeal; onClose: () => void; onLog: (items: UsualLog[]) => void }) {
  const t = useTheme();
  const [items, setItems] = useState<EditItem[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const fresh = useRef(true);
  useEffect(() => {
    if (visible) {
      setItems(meal.items.map((i) => ({ food_id: i.food_id, name: i.name, gramsStr: String(i.grams), kcal_100g: i.kcal_100g, protein_100g: i.protein_100g, carb_100g: i.carb_100g, fat_100g: i.fat_100g, on: true })));
      setActive(null);
    }
  }, [visible, meal]);
  const press = (k: string) => {
    if (active == null) return;
    setItems((xs) => xs.map((it, i) => (i === active ? { ...it, gramsStr: applyNumberKey(it.gramsStr, k, fresh.current) } : it)));
    fresh.current = false;
  };
  const focus = (i: number) => {
    setActive(i);
    fresh.current = true;
  };
  const toggle = (i: number) => setItems((xs) => xs.map((it, idx) => (idx === i ? { ...it, on: !it.on } : it)));
  const included: UsualLog[] = items.filter((i) => i.on && Number(i.gramsStr) > 0).map((i) => ({ food_id: i.food_id, name: i.name, grams: Number(i.gramsStr), kcal_100g: i.kcal_100g, protein_100g: i.protein_100g, carb_100g: i.carb_100g, fat_100g: i.fat_100g }));
  const total = Math.round(included.reduce((a, it) => a + (it.kcal_100g * it.grams) / 100, 0));
  return (
    <Sheet visible={visible} onClose={onClose} title="Your usual">
      {items.map((it, i) => {
        const g = Number(it.gramsStr) || 0;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <Pressable onPress={() => toggle(i)} hitSlop={6}>
              <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: it.on ? t.accent : 'transparent', borderWidth: it.on ? 0 : 1.8, borderColor: t.hairline }}>
                {it.on ? <Icon name="check" size={15} stroke={3} color="#fff" /> : null}
              </View>
            </Pressable>
            <T w={700} size={15} color={it.on ? t.text : t.text3} numberOfLines={1} style={{ flex: 1 }}>
              {it.name}
            </T>
            <Pressable
              onPress={() => focus(i)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: active === i ? t.accentSoft : t.surface, borderWidth: 1.5, borderColor: active === i ? t.accent : t.hairline, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }}
            >
              <T num w={800} size={15}>
                {it.gramsStr || '0'}
              </T>
              <T w={700} size={11} color={t.text3}>
                g
              </T>
            </Pressable>
            <T num w={800} size={14} color={t.text3} style={{ width: 42, textAlign: 'right' }}>
              {Math.round((it.kcal_100g * g) / 100)}
            </T>
          </View>
        );
      })}
      <View style={{ marginTop: 8, marginBottom: 14 }}>
        {active == null ? (
          <T w={600} size={13} color={t.text3} style={{ textAlign: 'center', marginBottom: 8 }}>
            Tap a gram value to adjust · uncheck to skip
          </T>
        ) : null}
        <NumberPad onKey={press} keyHeight={50} />
      </View>
      <Button full size="lg" icon="check" onPress={() => onLog(included)}>
        Log {included.length} · {total} kcal
      </Button>
    </Sheet>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  const t = useTheme();
  return (
    <View>
      <SectionLabel>{label}</SectionLabel>
      <T num w={800} size={26} color={muted ? t.text2 : t.text}>
        {value}
      </T>
    </View>
  );
}
