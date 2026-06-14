// GoalsScreen.tsx — the weekly-goals checklist on its own page. Marmalade suggests a few, you add
// your own, and the measurable ones (logging, walks, under-goal, weigh-in) tick themselves.

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Checkbox, Icon, Screen, ScreenHeader, T, TextField } from '../components';
import { api, type WeeklyGoal } from '../lib/api';
import { todayStr } from '../lib/date';
import { useTheme } from '../theme';

export function GoalsScreen() {
  const t = useTheme();
  const nav = useNavigation();
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
    <Screen>
      <ScreenHeader title="Weekly goals" onBack={() => nav.goBack()} />

      <Card pad={16}>
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
            <Checkbox checked={!!g.done} onToggle={g.auto ? undefined : () => toggle(g)} />
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

      <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginTop: 12, lineHeight: 18 }}>
        Goals reset each week. The ones marked AUTO tick themselves from your logging, walks, and weigh-ins.
      </T>
    </Screen>
  );
}
