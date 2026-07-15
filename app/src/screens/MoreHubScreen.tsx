// MoreHubScreen.tsx — hub for Recipes, Notes/Journal, Analytics, Settings.

import React from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Card, Icon, Screen, T } from '../components';
import type { IconName } from '../components';
import { api } from '../lib/api';
import { useTheme } from '../theme';
import type { MoreStackParams } from '../navigation/types';

const ITEMS: { icon: IconName; label: string; sub: string; route: keyof MoreStackParams }[] = [
  { icon: 'food', label: 'Recipes', sub: 'Low-cal ideas, cook times', route: 'Recipes' },
  { icon: 'star', label: 'Talk to Marmalade', sub: 'A friend for the tricky moments', route: 'MarmaladeChat' },
  { icon: 'flame', label: 'Meal plan', sub: 'AI plan that fits your goal', route: 'MealPlan' },
  { icon: 'check', label: 'Weekly goals', sub: 'Check off your week', route: 'Goals' },
  { icon: 'edit', label: 'Notes & journal', sub: 'How you’re feeling', route: 'Notes' },
  { icon: 'drop', label: 'Cycle', sub: 'Periods & predictions', route: 'Cycle' },
  { icon: 'trend', label: 'Analytics', sub: 'Trend, TDEE, projections', route: 'Analytics' },
  { icon: 'gear', label: 'Settings', sub: 'Goals, units, reminders', route: 'Settings' },
];

export function MoreHubScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<MoreStackParams, 'MoreHub'>>();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const items = ITEMS.filter((it) => it.route !== 'Cycle' || settings.data?.cycle_tracking);
  return (
    <Screen>
      <T w={800} size={30} style={{ marginTop: 10, marginBottom: 16 }}>
        More
      </T>
      <Card pad={6}>
        {items.map((it, i) => (
          <Pressable
            key={it.label}
            onPress={() => nav.navigate(it.route)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderBottomWidth: i === items.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.accentSofter, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={it.icon} size={22} color={t.accentPress} />
            </View>
            <View style={{ flex: 1 }}>
              <T w={800} size={16}>
                {it.label}
              </T>
              <T w={700} size={13} color={t.text3}>
                {it.sub}
              </T>
            </View>
            <Icon name="chevR" size={20} color={t.text3} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
