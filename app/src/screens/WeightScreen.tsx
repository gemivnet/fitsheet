// WeightScreen.tsx — trend, chart, goal progress, and progress photos, all from the API.

import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, Icon, NumberPad, ProgressBar, Screen, SectionLabel, SegmentedControl, Sheet, T, useNumberField, WeightChart, type WeightPoint } from '../components';
import { api, fileUrl, type WeightEntry } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import { addDaysStr, prettyDate, todayStr } from '../lib/date';
import { fmtWeight, fromDisplayWeight, type Units } from '../lib/units';
import { FontSize, Radius, useTheme } from '../theme';
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
    .map((e, i) => ({ x: i, raw: e.weight_lb, trend: e.trend_lb ?? e.weight_lb, date: e.entry_date }));
  const g = goal.data;
  const [editing, setEditing] = useState<WeightEntry | null>(null);
  const recent = [...all].reverse().slice(0, 10);

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
          <WeightChart data={pts} goal={g?.target ?? undefined} height={210} fmtY={(lb) => fmtWeight(lb, units, 0)} />
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

      {/* recent weigh-ins — tap one to fix a typo or remove it */}
      {recent.length ? (
        <View style={{ marginBottom: 16 }}>
          <SectionLabel style={{ marginBottom: 10 }}>Recent weigh-ins · tap to edit</SectionLabel>
          <Card pad={6}>
            {recent.map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => setEditing(e)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i === recent.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}
              >
                <T w={700} size={14} color={t.text2} style={{ flex: 1 }}>
                  {prettyDate(e.entry_date)}
                </T>
                {e.note ? <Icon name="edit" size={14} color={t.text3} /> : null}
                <T num w={800} size={16}>
                  {fmtWeight(e.weight_lb, units)} {units}
                </T>
              </Pressable>
            ))}
          </Card>
        </View>
      ) : null}

      <EditWeightSheet entry={editing} units={units} onClose={() => setEditing(null)} />

      {/* progress photos */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 2, marginTop: 6, marginBottom: 12 }}>
        <SectionLabel>Progress photos</SectionLabel>
      </View>
      {photos.data && photos.data.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {photos.data.slice(0, 8).map((p, i) => {
            const extra = photos.data!.length - 8;
            const isLast = i === 7 && extra > 0;
            return (
              <View key={p.id} style={{ width: '22.5%', aspectRatio: 3 / 4, borderRadius: Radius.chip, overflow: 'hidden', backgroundColor: t.surface2 }}>
                <Image source={{ uri: fileUrl(`/api/weight-photos/${p.id}/file`) }} style={{ width: '100%', height: '100%' }} />
                {isLast ? (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                    <T w={800} size={FontSize.body} color="#fff">
                      +{extra + 1}
                    </T>
                  </View>
                ) : null}
              </View>
            );
          })}
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

// Fix a typo'd weigh-in (or remove one) without deleting and re-entering everything.
function EditWeightSheet({ entry, units, onClose }: { entry: WeightEntry | null; units: Units; onClose: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const field = useNumberField('0');
  useEffect(() => {
    if (entry) field.reset(fmtWeight(entry.weight_lb, units));
  }, [entry]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['weight'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };
  const save = useMutation({
    mutationFn: (p: { id: number; weight_lb: number }) => api.weight.update(p.id, { weight_lb: p.weight_lb }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.weight.remove(id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  if (!entry) return null;
  const val = Number(field.value) || 0;
  return (
    <Sheet visible={!!entry} onClose={onClose} title={prettyDate(entry.entry_date)}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
        <T num w={800} size={34}>
          {field.value || '0'}
        </T>
        <T w={800} size={16} color={t.text3}>
          {units}
        </T>
      </View>
      <View style={{ marginBottom: 16 }}>
        <NumberPad onKey={field.press} />
      </View>
      <Button full size="lg" icon="check" onPress={() => val > 0 && save.mutate({ id: entry.id, weight_lb: Math.round(fromDisplayWeight(val, units) * 10) / 10 })}>
        Save
      </Button>
      <Pressable
        onPress={() => confirmAction('Remove this weigh-in?', prettyDate(entry.entry_date), () => remove.mutate(entry.id), { confirmText: 'Remove', destructive: true })}
        style={{ alignItems: 'center', paddingVertical: 14 }}
      >
        <T w={800} size={15} color={t.caution}>
          Remove weigh-in
        </T>
      </Pressable>
    </Sheet>
  );
}
