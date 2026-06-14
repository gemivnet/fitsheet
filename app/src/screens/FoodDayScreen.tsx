// FoodDayScreen.tsx — the day's food log (diary). Meals split by time of day, each with a
// "complete" tick. Tap a food to edit its amount, move it to another meal, or remove it.

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BankLine, Button, Card, Checkbox, Chip, FoodRow, Icon, NumberPad, ProgressBar, RoundBtn, Screen, Sheet, showToast, T, useNumberField } from '../components';
import { api, type LogEntry } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import { addDaysStr, isToday, prettyDate, slotForNow, todayStr } from '../lib/date';
import { DAY_UNDER_GOAL, pick } from '../lib/encouragement';
import { useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

const SLOTS: { key: string; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

const fmt = (x: number) => String(Math.round(x * 10) / 10);

type Props = NativeStackScreenProps<FoodStackParams, 'FoodDay'>;

export function FoodDayScreen({ navigation }: Props) {
  const t = useTheme();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const day = useQuery({ queryKey: ['foodlog', date], queryFn: () => api.foodLog.day(date) });

  useFocusEffect(useCallback(() => void day.refetch(), [day.refetch]));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const remove = useMutation({ mutationFn: (id: number) => api.foodLog.remove(id), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (p: { id: number; grams: number; meal_slot: string }) => api.foodLog.update(p.id, { grams: p.grams, meal_slot: p.meal_slot }),
    onSuccess: invalidate,
  });
  const snooze = useMutation({ mutationFn: (on: boolean) => api.foodLog.snooze(date, on), onSuccess: invalidate });
  const mealComplete = useMutation({
    mutationFn: (p: { slot: string; on: boolean }) => api.foodLog.mealComplete(date, p.slot, p.on),
    onSuccess: (sum, p) => {
      invalidate();
      if (p.slot === 'dinner' && p.on && isToday(date)) {
        qc.invalidateQueries({ queryKey: ['day-summary'] });
        const left = sum.banking ? sum.adjusted_remaining : sum.remaining;
        if (sum.totals.kcal > 0 && left >= 0) showToast(pick(DAY_UNDER_GOAL));
      }
    },
  });

  const removeItem = (e: LogEntry) => {
    setEditing(null);
    confirmAction('Remove food?', `${e.name} · ${Math.round(e.kcal)} kcal`, () => remove.mutate(e.id), { confirmText: 'Remove', destructive: true });
  };

  const openAdd = (slot: string) => navigation.navigate('AddFood', { slot, date });
  const d = day.data;
  const eaten = d ? Math.round(d.totals.kcal) : 0;
  const banking = !!d?.banking;
  const target = d ? (banking ? d.adjusted_goal : d.goal) : 0;
  const remaining = d ? (banking ? d.adjusted_remaining : d.remaining) : 0;

  const itemCount = SLOTS.reduce((n, s) => n + (d?.slots?.[s.key] ?? []).length, 0);

  return (
    <View style={{ flex: 1 }}>
      <Screen padBottom={110}>
      {/* date selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 16 }}>
        <RoundBtn icon="chevL" onPress={() => setDate((x) => addDaysStr(x, -1))} />
        <View style={{ alignItems: 'center' }}>
          <T w={800} size={22}>
            {isToday(date) ? 'Today' : prettyDate(date)}
          </T>
          <T w={700} size={13} color={t.text3}>
            {prettyDate(date)}
          </T>
        </View>
        <RoundBtn icon="chevR" onPress={() => setDate((x) => addDaysStr(x, 1))} />
      </View>

      {/* total vs goal (goal adjusts for the weekly bank when banking is on) */}
      <Card pad={20} style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
            <T num w={800} size={34}>
              {eaten}
            </T>
            <T w={800} size={15} color={t.text3}>
              / {target} kcal
            </T>
          </View>
          <T num w={800} size={15} color={remaining < 0 ? t.caution : t.accentPress}>
            {remaining} left
          </T>
        </View>
        <ProgressBar value={eaten} max={target || 1} height={14} showOver />
        {banking && d && (d.bank_week !== 0 || d.bank_snoozed) ? <BankLine day={d} onSnooze={(on) => snooze.mutate(on)} /> : null}
      </Card>

      {SLOTS.map(({ key, label }) => {
        const items = d?.slots?.[key] ?? [];
        const sub = Math.round(d?.slot_kcal?.[key] ?? 0);
        const done = !!d?.slots_complete?.[key];
        return (
          <View key={key} style={{ marginBottom: 14 }}>
            <Card pad={18}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: items.length ? 6 : 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <Checkbox checked={done} onToggle={() => mealComplete.mutate({ slot: key, on: !done })} />
                  <T w={800} size={18} color={done ? t.text3 : t.text}>
                    {label}
                  </T>
                  {sub ? (
                    <T num w={800} size={14} color={t.text3}>
                      {sub} kcal
                    </T>
                  ) : null}
                </View>
                <Pressable onPress={() => openAdd(key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.accentSoft, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 }}>
                  <Icon name="plus" size={15} stroke={2.6} color={t.accentPress} />
                  <T w={800} size={13} color={t.accentPress}>
                    Add
                  </T>
                </Pressable>
              </View>
              {items.length === 0 ? (
                <T w={600} size={14} color={t.text3} style={{ paddingTop: 8, paddingBottom: 2 }}>
                  Nothing logged yet — tap Add.
                </T>
              ) : (
                items.map((it, i) => (
                  <SwipeRow key={it.id} onRemove={() => removeItem(it)}>
                    <Pressable onPress={() => setEditing(it)} delayLongPress={250} onLongPress={() => removeItem(it)} style={{ backgroundColor: t.surface }}>
                      <FoodRow
                        name={it.name}
                        grams={Math.round(it.grams)}
                        kcal={Math.round(it.kcal)}
                        eatingOut={!!it.eating_out}
                        macros={[
                          { label: 'Protein', grams: Math.round(it.protein), varName: 'pro' },
                          { label: 'Carb', grams: Math.round(it.carb), varName: 'carb' },
                          { label: 'Fat', grams: Math.round(it.fat), varName: 'fat' },
                        ]}
                        last={i === items.length - 1}
                      />
                    </Pressable>
                  </SwipeRow>
                ))
              )}
            </Card>
          </View>
        );
      })}

      {itemCount > 0 ? (
        <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginTop: 6 }}>
          Tip: tap a food to edit the amount, move it to another meal, or remove it.
        </T>
      ) : null}

      <LogItemSheet
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(grams, slot) => {
          if (editing) update.mutate({ id: editing.id, grams, meal_slot: slot });
          setEditing(null);
        }}
        onRemove={(it) => removeItem(it)}
      />
      </Screen>

      {/* always-reachable add — no scrolling past the whole day to log something */}
      <Pressable
        onPress={() => openAdd(slotForNow())}
        style={[
          {
            position: 'absolute',
            right: 22,
            bottom: 26,
            width: 60,
            height: 60,
            borderRadius: 999,
            backgroundColor: t.accent,
            alignItems: 'center',
            justifyContent: 'center',
          },
          t.shadowSm,
        ]}
      >
        <Icon name="plus" size={28} stroke={2.8} color="#fff" />
      </Pressable>
    </View>
  );
}

// Swipe a food row left to reveal Remove — still routes through the same confirm + delete as a
// long-press, so a slip of the thumb can't wipe a row by accident.
function SwipeRow({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  const t = useTheme();
  const renderRight = () => (
    <Pressable onPress={onRemove} style={{ backgroundColor: t.caution, justifyContent: 'center', alignItems: 'center', width: 96, flexDirection: 'row', gap: 6 }}>
      <Icon name="flame" size={16} stroke={2.6} color="#fff" />
      <T w={800} size={14} color="#fff">
        Remove
      </T>
    </Pressable>
  );
  return (
    <Swipeable renderRightActions={renderRight} overshootRight={false} rightThreshold={40} friction={1.6}>
      {children}
    </Swipeable>
  );
}

function LogItemSheet({
  item,
  onClose,
  onSave,
  onRemove,
}: {
  item: LogEntry | null;
  onClose: () => void;
  onSave: (grams: number, slot: string) => void;
  onRemove: (it: LogEntry) => void;
}) {
  const t = useTheme();
  const grams = useNumberField('100');
  const [slot, setSlot] = useState('snacks');

  useEffect(() => {
    if (!item) return;
    grams.reset(fmt(item.grams));
    setSlot(item.meal_slot);
  }, [item]);

  if (!item) return null;
  const g = Number(grams.value) || 0;
  const per100 = item.grams > 0 ? (item.kcal / item.grams) * 100 : 0;
  const kcal = Math.round((per100 * g) / 100);

  return (
    <Sheet visible={!!item} onClose={onClose} title={item.name}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <T num w={800} size={30}>
            {fmt(g)}
          </T>
          <T w={800} size={15} color={t.text3}>
            g
          </T>
        </View>
        <T num w={800} size={24} color={t.accentPress}>
          {kcal} kcal
        </T>
      </View>

      <View style={{ marginBottom: 16 }}>
        <NumberPad onKey={grams.press} keyHeight={54} />
      </View>

      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Meal
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {SLOTS.map((s) => (
          <Chip key={s.key} active={slot === s.key} onPress={() => setSlot(s.key)}>
            {s.label}
          </Chip>
        ))}
      </View>

      <Button full size="lg" icon="check" onPress={() => onSave(g, slot)}>
        Save
      </Button>
      <Pressable onPress={() => onRemove(item)} style={{ alignItems: 'center', paddingVertical: 14 }}>
        <T w={800} size={15} color={t.caution}>
          Remove from log
        </T>
      </Pressable>
    </Sheet>
  );
}
