// OnboardingScreen.tsx — friendly first-run setup. Captures her name, units, goals, and first
// weigh-in, then flips `onboarded` so the app opens to the dashboard with her real data.

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Button, CalorieCalculator, Card, CatSprite, Screen, SectionLabel, SegmentedControl, showToast, T, TextField } from '../components';
import { api } from '../lib/api';
import { fromDisplayWeight, toDisplayWeight, type Units } from '../lib/units';
import { useTheme } from '../theme';

// Re-express a typed weight in new units (so switching lb↔kg doesn't leave "180" meaning kg).
const convert = (val: string, from: Units, to: Units): string => {
  const n = Number(val);
  if (!val.trim() || !Number.isFinite(n)) return val;
  return String(Math.round(toDisplayWeight(fromDisplayWeight(n, from), to) * 10) / 10);
};

export function OnboardingScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [units, setUnits] = useState<Units>('lb');
  const [current, setCurrent] = useState('');
  const [target, setTarget] = useState('');
  const [goal, setGoal] = useState('1850');
  const [saving, setSaving] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  async function finish(skip = false) {
    setSaving(true);
    try {
      if (skip) {
        await api.settings.update({ onboarded: true });
      } else {
        const startLb = current ? Math.round(fromDisplayWeight(Number(current), units) * 10) / 10 : null;
        await api.settings.update({
          display_name: name.trim() || 'there',
          units,
          daily_calorie_goal: Number(goal) || 1850,
          weight_start_lb: startLb,
          weight_target_lb: target ? Math.round(fromDisplayWeight(Number(target), units) * 10) / 10 : null,
          onboarded: true,
        });
        if (startLb) await api.weight.log({ weight_lb: startLb });
      }
      qc.invalidateQueries();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padTop={20}>
      <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 18 }}>
        <View style={{ width: 96, height: 96, borderRadius: 999, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <CatSprite size={62} />
        </View>
        <T w={800} size={30} style={{ textAlign: 'center' }}>
          Hi, I&rsquo;m Marmalade
        </T>
        <T w={600} size={16} color={t.text2} style={{ textAlign: 'center', maxWidth: 320, lineHeight: 23, marginTop: 8 }}>
          I&rsquo;ll keep you company here — cheering you on and watching your numbers so you don&rsquo;t have to. A couple of quick things and we&rsquo;re set. 🐾
        </T>
      </View>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel style={{ marginBottom: 14 }}>About you</SectionLabel>
        <TextField label="What should we call you?" value={name} onChangeText={setName} placeholder="Your name" />
        <SectionLabel style={{ marginBottom: 6 }}>Units</SectionLabel>
        <View style={{ marginBottom: 4 }}>
          <SegmentedControl
            options={['lb', 'kg']}
            value={units}
            onChange={(o) => {
              const next = o as Units;
              if (next === units) return;
              setCurrent((c) => convert(c, units, next));
              setTarget((tg) => convert(tg, units, next));
              setUnits(next);
            }}
          />
        </View>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <SectionLabel style={{ marginBottom: 14 }}>Your goals</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextField label="Current weight" value={current} onChangeText={setCurrent} keyboardType="numeric" suffix={units} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Goal weight" value={target} onChangeText={setTarget} keyboardType="numeric" suffix={units} />
          </View>
        </View>
        <TextField label="Daily calorie goal" value={goal} onChangeText={setGoal} keyboardType="numeric" suffix="kcal" />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -4 }}>
          <T w={600} size={13} color={t.text3} style={{ flex: 1, paddingRight: 10 }}>
            This is yours to set — whatever target you&rsquo;re aiming for.
          </T>
          <Pressable onPress={() => setCalcOpen(true)} hitSlop={8}>
            <T w={800} size={13} color={t.accentPress}>
              Calculate it
            </T>
          </Pressable>
        </View>
      </Card>

      <Button full size="lg" icon="check" onPress={() => finish(false)}>
        {saving ? 'Setting up…' : 'Start tracking'}
      </Button>
      <View style={{ alignItems: 'center', marginTop: 14, marginBottom: 8 }}>
        <Pressable onPress={() => finish(true)} hitSlop={10}>
          <T w={800} size={14} color={t.text3}>
            Skip for now
          </T>
        </Pressable>
      </View>

      <CalorieCalculator
        visible={calcOpen}
        onClose={() => setCalcOpen(false)}
        units={units}
        currentWeight={current}
        onUse={(g) => {
          setGoal(String(g));
          showToast('Goal set — finish up and Start tracking');
        }}
      />
    </Screen>
  );
}
