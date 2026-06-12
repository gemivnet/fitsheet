// MealPlanScreen.tsx — AI meal plan that fits her calorie goal, built from her saved recipes/favorites.

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, Icon, Screen, SegmentedControl, T } from '../components';
import { api } from '../lib/api';
import { useTheme } from '../theme';

export function MealPlanScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const [days, setDays] = useState('3');
  const plan = useMutation({ mutationFn: () => api.ai.mealPlan(Number(days) || 3), meta: { suppressErrorToast: true } });
  const goal = settings.data?.daily_calorie_goal ?? 0;

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

      <T w={600} size={14} color={t.text2} style={{ marginBottom: 16, lineHeight: 20 }}>
        A few days of meals at or under your {goal} kcal goal, leaning on your saved recipes & favorites.
      </T>

      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Days
      </T>
      <View style={{ marginBottom: 16 }}>
        <SegmentedControl options={['3', '5', '7']} value={days} onChange={setDays} />
      </View>
      <Button full size="lg" icon="food" onPress={() => plan.mutate()}>
        {plan.isPending ? 'Planning…' : plan.data ? 'Regenerate' : 'Generate plan'}
      </Button>

      {plan.isError ? (
        <T w={700} color={t.caution} style={{ marginTop: 14 }}>
          Couldn&rsquo;t generate — is the API key set on the server?
        </T>
      ) : null}

      {plan.data?.plan?.days?.length ? (
        <View style={{ marginTop: 18 }}>
          {plan.data.plan.days.map((d, i) => (
            <Card key={i} pad={16} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <T w={800} size={17}>
                  {d.label}
                </T>
                <T num w={800} size={15} color={d.total <= goal ? t.success : t.caution}>
                  {d.total} kcal
                </T>
              </View>
              {d.meals.map((m, j) => (
                <View key={j} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: j === d.meals.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <T w={700} size={12} color={t.text3} style={{ textTransform: 'capitalize' }}>
                      {m.slot}
                    </T>
                    <T w={700} size={15} numberOfLines={1}>
                      {m.name}
                    </T>
                  </View>
                  <T num w={800} size={14} color={t.text2}>
                    {m.kcal}
                  </T>
                </View>
              ))}
            </Card>
          ))}
          <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginBottom: 8 }}>
            Ideas only — tap Regenerate for a fresh take.
          </T>
        </View>
      ) : plan.data ? (
        <T w={700} color={t.text3} style={{ marginTop: 14 }}>
          No plan came back — try again.
        </T>
      ) : null}
      <View style={{ height: 20 }} />
    </Screen>
  );
}
