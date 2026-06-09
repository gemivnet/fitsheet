// FoodDayScreen.tsx — the day's log by meal, from the API. Add per meal; long-press a row to remove.

import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, FoodRow, Icon, ProgressBar, RoundBtn, Screen, T } from '../components';
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

type Props = NativeStackScreenProps<FoodStackParams, 'FoodDay'>;

export function FoodDayScreen({ navigation }: Props) {
  const t = useTheme();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const day = useQuery({ queryKey: ['foodlog', date], queryFn: () => api.foodLog.day(date) });

  useFocusEffect(useCallback(() => void day.refetch(), [day.refetch]));

  const remove = useMutation({
    mutationFn: (id: number) => api.foodLog.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['foodlog', date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const confirmRemove = (e: LogEntry) =>
    confirmAction('Remove food?', e.name, () => remove.mutate(e.id), { confirmText: 'Remove', destructive: true });

  const openAdd = (slot: string) => navigation.navigate('AddFood', { slot, date });
  const d = day.data;

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

      {/* total vs goal */}
      <Card pad={20} style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
            <T num w={800} size={34}>
              {d ? Math.round(d.totals.kcal) : 0}
            </T>
            <T w={800} size={15} color={t.text3}>
              / {d?.goal ?? 0} kcal
            </T>
          </View>
          <T num w={800} size={15} color={t.accentPress}>
            {d ? d.remaining : 0} left
          </T>
        </View>
        <ProgressBar value={d ? d.totals.kcal : 0} max={d?.goal ?? 1} height={14} showOver />
      </Card>

      {SLOTS.map(({ key, label }) => {
        const items = d?.slots?.[key] ?? [];
        const sub = Math.round(d?.slot_kcal?.[key] ?? 0);
        return (
          <View key={key} style={{ marginBottom: 14 }}>
            <Card pad={18}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: items.length ? 6 : 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                  <T w={800} size={18}>
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
                  <Pressable key={it.id} onLongPress={() => confirmRemove(it)} delayLongPress={250}>
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
        Tip: long-press a food to remove it.
      </T>
    </Screen>
  );
}
