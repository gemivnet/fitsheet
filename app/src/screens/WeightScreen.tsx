// WeightScreen.tsx — trend, chart, goal progress, and progress photos, all from the API.

import React, { useCallback, useState } from 'react';
import { Image, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, Icon, ProgressBar, Screen, SectionLabel, SegmentedControl, T, WeightChart, type WeightPoint } from '../components';
import { api, fileUrl } from '../lib/api';
import { addDaysStr, todayStr } from '../lib/date';
import { fmtWeight } from '../lib/units';
import { useTheme } from '../theme';
import type { WeightStackParams } from '../navigation/types';

const RANGE_DAYS: Record<string, number> = { '1M': 30, '3M': 90, '6M': 180, All: 100000 };

export function WeightScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<WeightStackParams, 'Weight'>>();
  const [range, setRange] = useState('3M');

  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const entries = useQuery({ queryKey: ['weight'], queryFn: api.weight.list });
  const goal = useQuery({ queryKey: ['weight', 'goal'], queryFn: api.weight.goal });
  const photos = useQuery({ queryKey: ['weight', 'photos'], queryFn: () => api.weightPhotos.list() });

  useFocusEffect(
    useCallback(() => {
      entries.refetch();
      goal.refetch();
      photos.refetch();
    }, [entries.refetch, goal.refetch, photos.refetch]),
  );

  const units = settings.data?.units ?? 'lb';
  const all = entries.data ?? [];
  const cutoff = addDaysStr(todayStr(), -RANGE_DAYS[range]);
  const pts: WeightPoint[] = all
    .filter((e) => e.entry_date >= cutoff || range === 'All')
    .map((e, i) => ({ x: i, raw: e.weight_lb, trend: e.trend_lb ?? e.weight_lb }));
  const g = goal.data;

  if (entries.isLoading) {
    return (
      <Screen>
        <T w={700} color={t.text3} style={{ paddingTop: 60, textAlign: 'center' }}>
          Loading…
        </T>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginTop: 12, marginBottom: 18 }}>
        <SectionLabel>Trend weight</SectionLabel>
        {g?.current_trend != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 4 }}>
            <T num w={800} size={56} style={{ lineHeight: 58 }}>
              {fmtWeight(g.current_trend, units)}
            </T>
            <T w={800} size={18} color={t.text2} style={{ marginBottom: 6 }}>
              {units}
            </T>
            {g.lost != null && g.lost > 0 ? (
              <View style={{ marginLeft: 'auto', marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.successSoft, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999 }}>
                <Icon name="trend" size={17} stroke={2.4} color={t.success} />
                <T w={800} size={16} color={t.success}>
                  −{fmtWeight(g.lost, units)} {units}
                </T>
              </View>
            ) : null}
          </View>
        ) : (
          <T w={700} size={16} color={t.text2} style={{ marginTop: 6 }}>
            No weigh-ins yet.
          </T>
        )}
      </View>

      {pts.length >= 2 ? (
        <Card pad={20} style={{ marginBottom: 16 }}>
          <View style={{ marginBottom: 14 }}>
            <SegmentedControl options={['1M', '3M', '6M', 'All']} value={range} onChange={setRange} />
          </View>
          <WeightChart data={pts} goal={g?.target ?? undefined} height={210} />
        </Card>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <EmptyState icon="weight" title="Start your trend" body="Log a few weigh-ins and your smoothed trend line will appear here." />
        </Card>
      )}

      {g?.pct != null ? (
        <Card pad={20} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <SectionLabel>Goal progress</SectionLabel>
            <T w={800} size={14} color={t.accentPress}>
              {g.pct}% there
            </T>
          </View>
          <ProgressBar value={g.pct} max={100} height={14} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <T num w={700} size={14} color={t.text2}>
              {g.lost != null ? `${fmtWeight(g.lost, units)} ${units} lost` : '—'}
            </T>
            <T num w={700} size={14} color={t.text3}>
              {g.remaining != null ? `${fmtWeight(g.remaining, units)} ${units} to go` : '—'}
            </T>
          </View>
        </Card>
      ) : null}

      {/* progress photos */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 2, marginTop: 6, marginBottom: 12 }}>
        <SectionLabel>Progress photos</SectionLabel>
      </View>
      {photos.data && photos.data.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {photos.data.slice(0, 8).map((p) => (
            <View key={p.id} style={{ width: '22.5%', aspectRatio: 3 / 4, borderRadius: 14, overflow: 'hidden', backgroundColor: t.surface2 }}>
              <Image source={{ uri: fileUrl(`/api/weight-photos/${p.id}/file`) }} style={{ width: '100%', height: '100%' }} />
            </View>
          ))}
        </View>
      ) : (
        <T w={600} size={14} color={t.text3} style={{ marginBottom: 20 }}>
          Add a photo when you log your weight to watch the change over time.
        </T>
      )}

      <Button full size="lg" icon="plus" onPress={() => nav.navigate('LogWeight')}>
        Log weight
      </Button>
    </Screen>
  );
}
