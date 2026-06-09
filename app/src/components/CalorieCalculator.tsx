// CalorieCalculator.tsx — OPTIONAL helper that *suggests* a daily calorie goal. Manual entry
// stays the source of truth: this only fills the field via onUse(); she can edit or ignore it.
// Mifflin-St Jeor from sex/age/height/weight/activity/rate, plus an empirical refinement from her
// measured maintenance (TDEE) once enough data exists.

import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fromDisplayWeight, LB_PER_KG, type Units } from '../lib/units';
import { useTheme } from '../theme';
import { Button, SegmentedControl, T } from './primitives';
import { Sheet, TextField } from './forms';

const ACTIVITY: [string, number][] = [
  ['Sedentary', 1.2],
  ['Light', 1.375],
  ['Moderate', 1.55],
  ['Active', 1.725],
  ['Very active', 1.9],
];

export function CalorieCalculator({
  visible,
  onClose,
  units,
  currentWeight,
  onUse,
}: {
  visible: boolean;
  onClose: () => void;
  units: Units;
  currentWeight?: string;
  onUse: (goal: number) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const analytics = useQuery({ queryKey: ['analytics'], queryFn: api.analytics.summary, enabled: visible });

  const [sex, setSex] = useState<'female' | 'male'>('female');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState(currentWeight ?? '');
  const [activity, setActivity] = useState(1.375);
  const rateOpts = units === 'kg' ? [0.25, 0.5, 0.75, 1] : [0.5, 1, 1.5, 2];
  const [rate, setRate] = useState(units === 'kg' ? 0.5 : 1);

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    if (s.sex) setSex(s.sex);
    if (s.age) setAge(String(s.age));
    if (s.height_cm) setHeight(units === 'kg' ? String(s.height_cm) : String(Math.round(s.height_cm / 2.54)));
    setActivity(s.activity_factor || 1.375);
  }, [settings.data, units]);
  useEffect(() => {
    if (currentWeight) setWeight(currentWeight);
  }, [currentWeight, visible]);

  const heightCm = units === 'kg' ? Number(height) : Number(height) * 2.54;
  const kg = fromDisplayWeight(Number(weight) || 0, units) / LB_PER_KG;
  const rateLb = units === 'kg' ? rate * LB_PER_KG : rate;
  const floor = sex === 'female' ? 1200 : 1500;
  const valid = Number(age) > 0 && heightCm > 0 && kg > 0;

  let tdee = 0;
  let formulaGoal = 0;
  if (valid) {
    const bmr = 10 * kg + 6.25 * heightCm - 5 * Number(age) + (sex === 'male' ? 5 : -161);
    tdee = Math.round(bmr * activity);
    formulaGoal = Math.max(floor, Math.round((tdee - (rateLb * 3500) / 7) / 10) * 10);
  }
  const emp = analytics.data?.tdee?.estimate ?? null;
  const empGoal = emp != null ? Math.max(floor, Math.round((emp - (rateLb * 3500) / 7) / 10) * 10) : null;

  async function persist() {
    await api.settings.update({ sex, age: Number(age) || null, height_cm: Math.round(heightCm) || null, activity_factor: activity, goal_rate_lb: rateLb });
    qc.invalidateQueries({ queryKey: ['settings'] });
  }
  async function use(goal: number) {
    await persist();
    onUse(goal);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Suggest a goal">
      <T w={600} size={14} color={t.text2} style={{ marginTop: -6, marginBottom: 14 }}>
        Just a starting point — you can always set your own number.
      </T>

      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
        Sex
      </T>
      <View style={{ marginBottom: 14 }}>
        <SegmentedControl options={['Female', 'Male']} value={sex === 'male' ? 'Male' : 'Female'} onChange={(o) => setSex(o === 'Male' ? 'male' : 'female')} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <TextField label="Age" value={age} onChangeText={setAge} keyboardType="numeric" suffix="yrs" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Height" value={height} onChangeText={setHeight} keyboardType="numeric" suffix={units === 'kg' ? 'cm' : 'in'} />
        </View>
      </View>
      <TextField label="Current weight" value={weight} onChangeText={setWeight} keyboardType="numeric" suffix={units} />

      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Activity
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {ACTIVITY.map(([label, factor]) => {
          const on = activity === factor;
          return (
            <Pressable
              key={label}
              onPress={() => setActivity(factor)}
              style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, backgroundColor: on ? t.accent : t.surface2, borderWidth: on ? 0 : 1, borderColor: t.hairline }}
            >
              <T w={800} size={13} color={on ? '#fff' : t.text2}>
                {label}
              </T>
            </Pressable>
          );
        })}
      </View>

      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        Target loss · {units}/week
      </T>
      <View style={{ marginBottom: 18 }}>
        <SegmentedControl options={rateOpts.map(String)} value={String(rate)} onChange={(o) => setRate(Number(o))} />
      </View>

      {valid ? (
        <View style={{ padding: 16, borderRadius: 16, backgroundColor: t.accentSofter, marginBottom: 12 }}>
          <T w={700} size={13} color={t.text2}>
            Maintenance ≈ <T num w={800} size={13}>{tdee}</T> kcal · suggested goal
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 12 }}>
            <T num w={800} size={34} color={t.accentPress}>
              {formulaGoal}
            </T>
            <T w={800} size={15} color={t.text2}>
              kcal / day
            </T>
          </View>
          <Button full icon="check" onPress={() => use(formulaGoal)}>
            Use this goal
          </Button>
        </View>
      ) : (
        <T w={600} size={14} color={t.text3} style={{ marginBottom: 12 }}>
          Fill in age, height and weight for a suggestion.
        </T>
      )}

      {empGoal != null ? (
        <View style={{ padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: t.hairline }}>
          <T w={700} size={13} color={t.text2}>
            From your own data: maintenance ≈ <T num w={800} size={13}>{emp}</T> kcal
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 12 }}>
            <T num w={800} size={28}>
              {empGoal}
            </T>
            <T w={800} size={14} color={t.text2}>
              kcal / day
            </T>
          </View>
          <Button variant="soft" full icon="trend" onPress={() => use(empGoal)}>
            Use my measured number
          </Button>
        </View>
      ) : null}
    </Sheet>
  );
}
