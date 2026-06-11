// FoodDayScreen.tsx — the day's food log (diary). Meals split by time of day, each with a
// "complete" tick. Tap a food to edit its amount, move it to another meal, or remove it.

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, FoodRow, Icon, ProgressBar, RoundBtn, Screen, Sheet, T } from '../components';
import { api, type LogEntry } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import { addDaysStr, isToday, prettyDate, slotForNow, todayStr } from '../lib/date';
import { useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

const SLOTS: { key: string; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];
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
  const mealComplete = useMutation({ mutationFn: (p: { slot: string; on: boolean }) => api.foodLog.mealComplete(date, p.slot, p.on), onSuccess: invalidate });

  const removeItem = (e: LogEntry) => {
    setEditing(null);
    confirmAction('Remove food?', e.name, () => remove.mutate(e.id), { confirmText: 'Remove', destructive: true });
  };

  const openAdd = (slot: string) => navigation.navigate('AddFood', { slot, date });
  const d = day.data;
  const eaten = d ? Math.round(d.totals.kcal) : 0;
  const banking = !!d?.banking;
  const target = d ? (banking ? d.adjusted_goal : d.goal) : 0;
  const remaining = d ? (banking ? d.adjusted_remaining : d.remaining) : 0;

  return (
    <Screen>
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
        {banking && d && (d.bank_week !== 0 || d.bank_snoozed) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Icon name={d.bank_snoozed ? 'bell' : d.bank_week > 0 ? 'trend' : 'flame'} size={14} stroke={2.4} color={d.bank_snoozed ? t.text3 : d.bank_week > 0 ? t.success : t.caution} />
              <T w={700} size={13} color={t.text2}>
                {d.bank_snoozed
                  ? 'Bank paused today — using your plain goal'
                  : d.bank_week > 0
                    ? `+${d.bank_week} banked this week — added to today`
                    : `${Math.abs(d.bank_week)} over this week — trimmed from today`}
              </T>
            </View>
            <Pressable
              onPress={() => snooze.mutate(!d.bank_snoozed)}
              hitSlop={8}
              style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.hairline }}
            >
              <T w={800} size={12} color={t.accentPress}>
                {d.bank_snoozed ? 'Undo' : 'Snooze'}
              </T>
            </Pressable>
          </View>
        ) : null}
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
                  <Pressable onPress={() => mealComplete.mutate({ slot: key, on: !done })} hitSlop={8}>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: done ? t.success : 'transparent',
                        borderWidth: done ? 0 : 1.8,
                        borderColor: t.hairline,
                      }}
                    >
                      {done ? <Icon name="check" size={15} stroke={3} color="#fff" /> : null}
                    </View>
                  </Pressable>
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
                  <Pressable key={it.id} onPress={() => setEditing(it)} delayLongPress={250} onLongPress={() => removeItem(it)}>
                    <FoodRow
                      name={it.name}
                      grams={Math.round(it.grams)}
                      kcal={Math.round(it.kcal)}
                      macros={[
                        { label: 'Protein', grams: Math.round(it.protein), varName: 'pro' },
                        { label: 'Carb', grams: Math.round(it.carb), varName: 'carb' },
                        { label: 'Fat', grams: Math.round(it.fat), varName: 'fat' },
                      ]}
                      last={i === items.length - 1}
                    />
                  </Pressable>
                ))
              )}
            </Card>
          </View>
        );
      })}

      <View style={{ marginTop: 6 }}>
        <Button full size="lg" icon="plus" onPress={() => openAdd(slotForNow())}>
          Add food
        </Button>
      </View>
      <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginTop: 12 }}>
        Tip: tap a food to edit the amount, move it to another meal, or remove it.
      </T>

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
  const [grams, setGrams] = useState('100');
  const [slot, setSlot] = useState('snacks');
  const [fresh, setFresh] = useState(true);

  useEffect(() => {
    if (!item) return;
    setGrams(fmt(item.grams));
    setSlot(item.meal_slot);
    setFresh(true);
  }, [item]);

  if (!item) return null;
  const g = Number(grams) || 0;
  const per100 = item.grams > 0 ? (item.kcal / item.grams) * 100 : 0;
  const kcal = Math.round((per100 * g) / 100);

  const press = (k: string) => {
    setGrams((cur) => {
      if (k === 'back') return fresh || cur.length <= 1 ? '0' : cur.slice(0, -1);
      const base = fresh || cur === '0' ? '' : cur;
      if (k === '.') return base.includes('.') ? base : `${base === '' ? '0' : base}.`;
      const next = base + k;
      return next.length > 7 ? base : next;
    });
    setFresh(false);
  };

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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => press(k)}
            style={({ pressed }) => ({
              width: '31.5%',
              flexGrow: 1,
              height: 54,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? t.accentSoft : t.surface,
              borderWidth: 1.5,
              borderColor: t.hairline,
            })}
          >
            {k === 'back' ? <Icon name="chevL" size={22} stroke={2.4} color={t.text2} /> : <T w={800} size={23}>{k}</T>}
          </Pressable>
        ))}
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
