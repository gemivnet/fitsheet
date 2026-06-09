// SettingsScreen.tsx — goals (manual calorie goal!), units, weigh-in reminder, and demo/reset.

import React, { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Icon, Screen, SectionLabel, SegmentedControl, T, TextField } from '../components';
import { api, type Settings } from '../lib/api';
import { confirmAction, notify } from '../lib/dialog';
import { fromDisplayWeight, toDisplayWeight, type Units } from '../lib/units';
import { useTheme } from '../theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SettingsScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [units, setUnits] = useState<Units>('lb');
  const [start, setStart] = useState('');
  const [target, setTarget] = useState('');
  const [weekday, setWeekday] = useState(0);
  const [hour, setHour] = useState('9');
  const [workoutReminders, setWorkoutReminders] = useState(true);

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setName(s.display_name);
    setGoal(String(s.daily_calorie_goal));
    setUnits(s.units);
    setStart(s.weight_start_lb != null ? String(Math.round(toDisplayWeight(s.weight_start_lb, s.units) * 10) / 10) : '');
    setTarget(s.weight_target_lb != null ? String(Math.round(toDisplayWeight(s.weight_target_lb, s.units) * 10) / 10) : '');
    setWeekday(s.weigh_in_weekday);
    setHour(String(s.weigh_in_hour));
    setWorkoutReminders(s.workout_reminders);
  }, [settings.data]);

  async function save() {
    const patch: Partial<Settings> = {
      display_name: name || 'there',
      daily_calorie_goal: Number(goal) || 1850,
      units,
      weight_start_lb: start ? Math.round(fromDisplayWeight(Number(start), units) * 10) / 10 : null,
      weight_target_lb: target ? Math.round(fromDisplayWeight(Number(target), units) * 10) / 10 : null,
      weigh_in_weekday: weekday,
      weigh_in_hour: Number(hour) || 9,
      workout_reminders: workoutReminders,
    };
    await api.settings.update(patch);
    qc.invalidateQueries();
    notify('Saved', 'Your settings are updated.');
  }

  function reset() {
    confirmAction(
      'Start fresh?',
      'This deletes all your data and restores starter foods/recipes.',
      async () => {
        await api.dev.reset();
        qc.invalidateQueries();
        notify('Reset', 'A clean slate — start logging!');
      },
      { confirmText: 'Reset everything', destructive: true },
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 16 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="chevL" size={26} color={t.text2} />
        </Pressable>
        <T w={800} size={30}>
          Settings
        </T>
      </View>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel style={{ marginBottom: 14 }}>Goals</SectionLabel>
        <TextField label="Your name" value={name} onChangeText={setName} placeholder="What should we call you?" />
        <TextField label="Daily calorie goal" value={goal} onChangeText={setGoal} keyboardType="numeric" suffix="kcal" />
        <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          Units
        </T>
        <View style={{ marginBottom: 14 }}>
          <SegmentedControl options={['lb', 'kg']} value={units} onChange={(o) => setUnits(o as Units)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextField label="Start weight" value={start} onChangeText={setStart} keyboardType="numeric" suffix={units} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Goal weight" value={target} onChangeText={setTarget} keyboardType="numeric" suffix={units} />
          </View>
        </View>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel style={{ marginBottom: 14 }}>Reminders</SectionLabel>
        <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
          Weigh-in day
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {DAYS.map((d, i) => (
            <Pressable
              key={d}
              onPress={() => setWeekday(i)}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: weekday === i ? t.accent : t.surface2, borderWidth: weekday === i ? 0 : 1, borderColor: t.hairline }}
            >
              <T w={800} size={13} color={weekday === i ? '#fff' : t.text2}>
                {d}
              </T>
            </Pressable>
          ))}
        </View>
        <TextField label="Weigh-in hour (0–23)" value={hour} onChangeText={setHour} keyboardType="numeric" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <T w={700} size={15} color={t.text2}>
            Day-before workout reminders
          </T>
          <Switch value={workoutReminders} onValueChange={setWorkoutReminders} trackColor={{ true: t.accent }} />
        </View>
      </Card>

      <Button full size="lg" icon="check" onPress={save}>
        Save settings
      </Button>

      <Card style={{ marginTop: 24 }}>
        <SectionLabel style={{ marginBottom: 12 }}>Data</SectionLabel>
        <Button variant="ghost" full onPress={reset}>
          Erase everything & start over
        </Button>
      </Card>
      <View style={{ height: 20 }} />
    </Screen>
  );
}
