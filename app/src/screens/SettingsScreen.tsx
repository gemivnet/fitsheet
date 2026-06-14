// SettingsScreen.tsx — goals (manual calorie goal!), units, weigh-in reminder, and demo/reset.

import React, { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, CalorieCalculator, Card, Screen, ScreenHeader, SectionLabel, SegmentedControl, showToast, T, TextField } from '../components';
import { api, type Settings } from '../lib/api';
import { confirmAction, notify } from '../lib/dialog';
import { fromDisplayWeight, toDisplayWeight, type Units } from '../lib/units';
import { useTheme } from '../theme';

function SupplementsManager() {
  const t = useTheme();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['supplements'], queryFn: api.supplements.list });
  const [name, setName] = useState('');
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['supplements'] });
    qc.invalidateQueries({ queryKey: ['supplements-today'] });
  };
  const add = useMutation({ mutationFn: () => api.supplements.create(name.trim()), onSuccess: () => { setName(''); invalidate(); } });
  const remove = useMutation({ mutationFn: (id: number) => api.supplements.remove(id), onSuccess: invalidate });
  return (
    <Card style={{ marginTop: 24 }}>
      <SectionLabel style={{ marginBottom: 8 }}>Vitamins &amp; medications</SectionLabel>
      <T w={600} size={13} color={t.text3} style={{ marginBottom: 12 }}>
        These show on Home as a daily check.
      </T>
      {list.data?.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.hairline }}>
          <T w={700} size={15} style={{ flex: 1 }} numberOfLines={1}>
            {s.name}
          </T>
          <Pressable onPress={() => remove.mutate(s.id)} hitSlop={8}>
            <T w={800} size={14} color={t.caution}>
              Remove
            </T>
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField label={undefined} value={name} onChangeText={setName} placeholder="e.g. Vitamin D, Metformin" />
        </View>
        <View style={{ marginBottom: 14 }}>
          <Button icon="plus" onPress={() => name.trim() && add.mutate()}>
            Add
          </Button>
        </View>
      </View>
    </Card>
  );
}

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
  const [banking, setBanking] = useState(true);
  const [calcOpen, setCalcOpen] = useState(false);

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
    setBanking(s.weekly_banking);
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
      weekly_banking: banking,
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
      <ScreenHeader title="Settings" onBack={() => nav.goBack()} />

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel style={{ marginBottom: 14 }}>Goals</SectionLabel>
        <TextField label="Your name" value={name} onChangeText={setName} placeholder="What should we call you?" />
        <TextField label="Daily calorie goal" value={goal} onChangeText={setGoal} keyboardType="numeric" suffix="kcal" />
        <Pressable onPress={() => setCalcOpen(true)} hitSlop={8} style={{ alignSelf: 'flex-end', marginTop: -6, marginBottom: 10 }}>
          <T w={800} size={13} color={t.accentPress}>
            Calculate it for me
          </T>
        </Pressable>
        <SectionLabel style={{ marginBottom: 6 }}>Units</SectionLabel>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <T w={700} size={15} color={t.text2}>
              Roll over calories (weekly bank)
            </T>
            <T w={600} size={12} color={t.text3} style={{ lineHeight: 17 }}>
              Eat under your goal and the spare calories roll into the rest of the week (up to ±800 a day); going over trims the next days a little. Tap Snooze on the ring to pause it for a day.
            </T>
          </View>
          <Switch value={banking} onValueChange={setBanking} trackColor={{ true: t.accent }} />
        </View>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel style={{ marginBottom: 14 }}>Reminders</SectionLabel>
        <SectionLabel style={{ marginBottom: 8 }}>Weigh-in day</SectionLabel>
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

      <SupplementsManager />

      <Card style={{ marginTop: 24 }}>
        <SectionLabel style={{ marginBottom: 12 }}>Data</SectionLabel>
        <Button variant="ghost" full onPress={reset}>
          Erase everything & start over
        </Button>
      </Card>

      <CalorieCalculator
        visible={calcOpen}
        onClose={() => setCalcOpen(false)}
        units={units}
        currentWeight={start}
        onUse={(g) => {
          setGoal(String(g));
          showToast('Goal filled in — tap Save settings to keep it');
        }}
      />
      <View style={{ height: 20 }} />
    </Screen>
  );
}
