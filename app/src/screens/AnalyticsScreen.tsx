// AnalyticsScreen.tsx — the "nerdy" tab: smoothed trend, empirical TDEE, rate, goal ETA, adherence.

import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Card, Icon, ProgressBar, Screen, SectionLabel, T, WeightChart, type WeightPoint } from '../components';
import { api } from '../lib/api';
import { prettyDate, todayStr } from '../lib/date';
import { fmtWeight } from '../lib/units';
import { useTheme } from '../theme';

export function AnalyticsScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const a = useQuery({ queryKey: ['analytics'], queryFn: api.analytics.summary });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const dining = useQuery({ queryKey: ['dining-stats'], queryFn: () => api.foodLog.diningStats(todayStr()) });
  useFocusEffect(useCallback(() => void a.refetch(), [a.refetch]));

  const units = settings.data?.units ?? 'lb';
  const d = a.data;
  const pts: WeightPoint[] = (d?.series ?? []).map((s, i) => ({ x: i, raw: s.raw, trend: s.trend }));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 16 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="chevL" size={26} color={t.text2} />
        </Pressable>
        <T w={800} size={30}>
          Analytics
        </T>
      </View>

      {!d ? (
        <T w={700} color={t.text3} style={{ padding: 8 }}>
          {a.isLoading ? 'Crunching…' : 'No data yet.'}
        </T>
      ) : (
        <>
          {pts.length >= 2 ? (
            <Card pad={20} style={{ marginBottom: 16 }}>
              <SectionLabel style={{ marginBottom: 6 }}>Trend weight</SectionLabel>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <T num w={800} size={32}>
                  {d.weight.current_trend != null ? fmtWeight(d.weight.current_trend, units) : '—'}
                </T>
                <T w={800} size={14} color={t.text2}>
                  {units}
                </T>
                {d.weight.lbs_per_week != null ? (
                  <T w={800} size={14} color={d.weight.lbs_per_week < 0 ? t.success : t.text3} style={{ marginLeft: 'auto' }}>
                    {d.weight.lbs_per_week > 0 ? '+' : ''}
                    {fmtWeight(d.weight.lbs_per_week, units)} {units}/wk
                  </T>
                ) : null}
              </View>
              <WeightChart data={pts} goal={d.goal.target ?? undefined} height={190} />
            </Card>
          ) : (
            <Card style={{ marginBottom: 16 }}>
              <T w={700} color={t.text3} style={{ padding: 6 }}>
                Log a couple weeks of weights and meals and this tab comes alive.
              </T>
            </Card>
          )}

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <Metric
              label="Est. maintenance"
              value={d.tdee.estimate != null ? `${d.tdee.estimate}` : '—'}
              sub={d.tdee.reason ? `${d.tdee.logged_days_in_window}/14 days logged` : 'kcal / day'}
            />
            <Metric label="Rate" value={d.weight.lbs_per_week != null ? `${fmtWeight(Math.abs(d.weight.lbs_per_week), units)}` : '—'} sub={`${units}/week ${d.weight.label}`} />
          </View>

          {d.goal.eta_date ? (
            <Card pad={18} style={{ marginBottom: 12 }}>
              <SectionLabel style={{ marginBottom: 8 }}>On track for your goal</SectionLabel>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                <Icon name="trend" size={18} color={t.accent} />
                <T w={800} size={20}>
                  ~{prettyDate(d.goal.eta_date)}
                </T>
                {d.goal.eta_weeks != null ? (
                  <T w={700} size={14} color={t.text3}>
                    in {d.goal.eta_weeks} wks
                  </T>
                ) : null}
              </View>
              {d.goal.pct != null ? <ProgressBar value={d.goal.pct} max={100} height={10} /> : null}
            </Card>
          ) : null}

          <Card pad={18}>
            <SectionLabel style={{ marginBottom: 12 }}>Adherence</SectionLabel>
            <Row label="Days logged" value={`${d.adherence.days_logged}`} />
            <Row label="Avg intake" value={d.adherence.avg_intake != null ? `${d.adherence.avg_intake} kcal` : '—'} />
            <Row
              label="vs goal"
              value={d.adherence.avg_intake_vs_goal != null ? `${d.adherence.avg_intake_vs_goal > 0 ? '+' : ''}${d.adherence.avg_intake_vs_goal} kcal` : '—'}
              tone={d.adherence.avg_intake_vs_goal != null && d.adherence.avg_intake_vs_goal <= 0 ? 'good' : 'warn'}
            />
            <Row label="Calorie bank" value={`${d.adherence.cumulative_deficit > 0 ? '+' : ''}${d.adherence.cumulative_deficit} kcal`} tone={d.adherence.cumulative_deficit >= 0 ? 'good' : 'warn'} />
            <Row label="Logging streak" value={`${d.adherence.logging_streak} days 🔥`} last />
          </Card>

          {dining.data && (dining.data.this_week > 0 || dining.data.last_week > 0) ? (
            <Card pad={18} style={{ marginTop: 12 }}>
              <SectionLabel style={{ marginBottom: 12 }}>Dining out</SectionLabel>
              <Row label="This week" value={`🍔 ${dining.data.this_week}×`} tone={dining.data.this_week > dining.data.last_week ? 'warn' : 'good'} />
              <Row label="Last week" value={`${dining.data.last_week}×`} last />
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  const t = useTheme();
  return (
    <Card pad={18} style={{ flex: 1 }}>
      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        {label}
      </T>
      <T num w={800} size={28}>
        {value}
      </T>
      <T w={700} size={12} color={t.text3} style={{ marginTop: 2 }}>
        {sub}
      </T>
    </Card>
  );
}

function Row({ label, value, tone, last }: { label: string; value: string; tone?: 'good' | 'warn'; last?: boolean }) {
  const t = useTheme();
  const color = tone === 'good' ? t.success : tone === 'warn' ? t.caution : t.text;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.hairline }}>
      <T w={700} size={15} color={t.text2}>
        {label}
      </T>
      <T num w={800} size={16} color={color}>
        {value}
      </T>
    </View>
  );
}
