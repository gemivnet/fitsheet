// ActivityScreen.tsx — Workouts (plan / open link / complete / ad-hoc) + Walks (preset one-tap / manual).

import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, Icon, Screen, SectionLabel, SegmentedControl, Sheet, showToast, T, TextField } from '../components';
import { api, type WalkLog, type WalkPreset, type Workout } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import { estWalkKcal, estWalkMinutes } from '../lib/activity';
import { addDaysStr, isToday, prettyDate, todayStr } from '../lib/date';
import { useTheme } from '../theme';

export function ActivityScreen() {
  const [tab, setTab] = useState('Workouts');
  return (
    <Screen>
      <T w={800} size={30} style={{ marginTop: 10, marginBottom: 16 }}>
        Activity
      </T>
      <View style={{ marginBottom: 18 }}>
        <SegmentedControl options={['Workouts', 'Walks']} value={tab} onChange={setTab} />
      </View>
      {tab === 'Workouts' ? <Workouts /> : <Walks />}
    </Screen>
  );
}

function Workouts() {
  const t = useTheme();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['workouts'], queryFn: () => api.workouts.list(addDaysStr(todayStr(), -7), addDaysStr(todayStr(), 28)) });
  useFocusEffect(useCallback(() => void list.refetch(), [list.refetch]));
  const [plan, setPlan] = useState(false);
  const [adhoc, setAdhoc] = useState(false);
  const [editing, setEditing] = useState<Workout | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['workouts'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const complete = useMutation({ mutationFn: (id: number) => api.workouts.complete(id), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: number) => api.workouts.remove(id), onSuccess: invalidate });

  // planned workouts whose day has passed shouldn't haunt the main list forever
  const today = todayStr();
  const overdue = (list.data ?? []).filter((w) => w.kind === 'planned' && w.scheduled_date && w.scheduled_date < today && !w.completed_at);
  const current = (list.data ?? []).filter((w) => !overdue.includes(w));

  return (
    <View>
      {overdue.length ? (
        <View style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 8 }}>Catch up</SectionLabel>
          <Card pad={6}>
            {overdue.map((w, i) => (
              <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i === overdue.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={700} size={15} color={t.text2} numberOfLines={1}>
                    {w.title}
                  </T>
                  <T w={600} size={12} color={t.text3}>
                    was {prettyDate(w.scheduled_date!)}
                  </T>
                </View>
                <Button variant="success" icon="check" size="sm" onPress={() => complete.mutate(w.id)}>
                  Did it
                </Button>
                <Pressable onPress={() => confirmAction('Skip this workout?', w.title, () => remove.mutate(w.id), { confirmText: 'Skip' })} hitSlop={8}>
                  <T w={800} size={13} color={t.text3}>
                    Skip
                  </T>
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {current.length ? (
        current.map((w) => <WorkoutCard key={w.id} w={w} onComplete={() => complete.mutate(w.id)} onRemove={() => remove.mutate(w.id)} onEdit={() => setEditing(w)} />)
      ) : !overdue.length ? (
        <Card style={{ marginBottom: 14 }}>
          <EmptyState icon="activity" title="Plan your week" body="Add a workout with a link to follow, then check it off when you're done." />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <View style={{ flex: 1 }}>
          <Button icon="plus" full onPress={() => setPlan(true)}>
            Plan workout
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="soft" icon="check" full onPress={() => setAdhoc(true)}>
            Log one now
          </Button>
        </View>
      </View>

      <WorkoutForm visible={plan} kind="planned" onClose={() => setPlan(false)} onSaved={invalidate} />
      <WorkoutForm visible={adhoc} kind="adhoc" onClose={() => setAdhoc(false)} onSaved={invalidate} />
      <WorkoutForm visible={!!editing} kind={editing?.kind === 'adhoc' ? 'adhoc' : 'planned'} initial={editing} onClose={() => setEditing(null)} onSaved={invalidate} />
    </View>
  );
}

function WorkoutCard({ w, onComplete, onRemove, onEdit }: { w: Workout; onComplete: () => void; onRemove: () => void; onEdit: () => void }) {
  const t = useTheme();
  const done = !!w.completed_at;
  return (
    <Card pad={18} style={{ marginBottom: 12 }}>
      <Pressable onPress={onEdit} onLongPress={() => confirmAction('Remove workout?', w.title, onRemove, { confirmText: 'Remove', destructive: true })} delayLongPress={300}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <T w={800} size={17} numberOfLines={2}>
              {w.title}
            </T>
            <T w={700} size={13} color={t.text3} style={{ marginTop: 2 }}>
              {w.scheduled_date ? prettyDate(w.scheduled_date) : 'Logged'}
              {w.planned_minutes ? ` · ${w.planned_minutes} min` : ''}
              {w.kind === 'adhoc' ? ' · manual' : ''}
            </T>
          </View>
          {done ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.successSoft, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999 }}>
              <Icon name="check" size={15} stroke={2.6} color={t.success} />
              <T w={800} size={13} color={t.success}>
                Done
              </T>
            </View>
          ) : null}
        </View>
        {!done ? (
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 14 }}>
            {w.external_url ? (
              <View style={{ flex: 1 }}>
                <Button variant="soft" icon="link" size="sm" full onPress={() => Linking.openURL(w.external_url!)}>
                  Open
                </Button>
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button variant="success" icon="check" size="sm" full onPress={onComplete}>
                Complete
              </Button>
            </View>
          </View>
        ) : null}
      </Pressable>
    </Card>
  );
}

function WorkoutForm({
  visible,
  kind,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  kind: 'planned' | 'adhoc';
  initial?: Workout | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr());
  const [minutes, setMinutes] = useState('');
  const [url, setUrl] = useState('');
  // seed for edit mode (or reset for a fresh add) each time the sheet opens
  React.useEffect(() => {
    if (!visible) return;
    setTitle(initial?.title ?? '');
    setDate(initial?.scheduled_date ?? todayStr());
    setMinutes(initial?.planned_minutes != null ? String(initial.planned_minutes) : '');
    setUrl(initial?.external_url ?? '');
  }, [visible, initial]);

  const save = async () => {
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      scheduled_date: kind === 'planned' ? date : null,
      planned_minutes: minutes ? Number(minutes) : null,
      external_url: url || null,
    };
    try {
      if (initial) await api.workouts.update(initial.id, payload);
      else await api.workouts.create({ ...payload, kind });
    } catch {
      showToast('Couldn’t save that — try again', { kind: 'error' });
      return;
    }
    onSaved();
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? 'Edit workout' : kind === 'planned' ? 'Plan a workout' : 'Log a workout'}>
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Full-body strength" autoFocus={!initial} />
      {kind === 'planned' ? <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2026-06-10" /> : null}
      <TextField label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="numeric" suffix="min" />
      {kind === 'planned' ? <TextField label="Link (optional)" value={url} onChangeText={setUrl} placeholder="YouTube / web link" /> : null}
      <Button full size="lg" icon="check" onPress={save}>
        Save
      </Button>
    </Sheet>
  );
}

// distance/minutes for a preset, filling in whichever wasn't set from the other.
function presetMetrics(p: WalkPreset): { miles: number | null; minutes: number | null } {
  const miles = p.default_distance ?? null;
  const minutes = p.default_minutes ?? (miles != null ? estWalkMinutes(miles) : null);
  return { miles, minutes };
}

function Walks() {
  const t = useTheme();
  const qc = useQueryClient();
  const presets = useQuery({ queryKey: ['walks', 'presets'], queryFn: api.walks.presets });
  const log = useQuery({ queryKey: ['walks', 'log'], queryFn: () => api.walks.log(addDaysStr(todayStr(), -30), todayStr()) });
  const goal = useQuery({ queryKey: ['weight', 'goal'], queryFn: api.weight.goal });
  useFocusEffect(useCallback(() => void log.refetch(), [log.refetch]));
  const [manual, setManual] = useState(false);

  const weightLb = goal.data?.current_raw ?? goal.data?.current_trend ?? goal.data?.start ?? 160;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['walks', 'log'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const quick = useMutation({ mutationFn: (p: WalkPreset) => api.walks.quick(p.id), onSuccess: invalidate });
  const removeWalk = useMutation({ mutationFn: (id: number) => api.walks.removeLog(id), onSuccess: invalidate });

  // group the recent log by day, newest first, with a per-day summary
  const days = useMemo(() => {
    const byDay = new Map<string, WalkLog[]>();
    for (const w of log.data ?? []) (byDay.get(w.walk_date) ?? byDay.set(w.walk_date, []).get(w.walk_date)!).push(w);
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [log.data]);

  return (
    <View>
      <SectionLabel style={{ marginBottom: 10 }}>Tap to log a walk</SectionLabel>
      <View style={{ gap: 10, marginBottom: 20 }}>
        {presets.data?.map((p) => {
          const { miles, minutes } = presetMetrics(p);
          const kcal = estWalkKcal({ miles, minutes, weightLb });
          return (
            <Pressable
              key={p.id}
              onPress={() => quick.mutate(p)}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, backgroundColor: t.surface }, t.shadowSm]}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.accentSofter, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="walk" size={24} color={t.accentPress} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w={800} size={16} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {p.label}
                </T>
                <T num w={700} size={13} color={t.text3} numberOfLines={1}>
                  {[miles != null ? `${miles} mi` : null, minutes != null ? `~${minutes} min` : null, kcal > 0 ? `~${kcal} kcal` : null].filter(Boolean).join(' · ') || 'tap to log'}
                </T>
              </View>
              <View style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={20} stroke={2.8} color="#fff" />
              </View>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setManual(true)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 }}>
          <Icon name="plus" size={16} stroke={2.6} color={t.accentPress} />
          <T w={800} size={14} color={t.accentPress}>
            Log a different walk
          </T>
        </Pressable>
      </View>

      <SectionLabel style={{ marginBottom: 10 }}>Recent</SectionLabel>
      {days.length ? (
        days.map(([date, walks]) => {
          const totMin = walks.reduce((a, w) => a + (w.minutes ?? 0), 0);
          const totMi = walks.reduce((a, w) => a + (w.distance ?? 0), 0);
          const totKcal = walks.reduce((a, w) => a + estWalkKcal({ miles: w.distance, minutes: w.minutes, weightLb }), 0);
          return (
            <View key={date} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, marginLeft: 2 }}>
                <T w={800} size={14}>
                  {isToday(date) ? 'Today' : prettyDate(date)}
                </T>
                <T num w={700} size={12} color={t.text3}>
                  {[totMi > 0 ? `${Math.round(totMi * 10) / 10} mi` : null, totMin > 0 ? `${totMin} min` : null, totKcal > 0 ? `~${totKcal} kcal` : null].filter(Boolean).join(' · ')}
                </T>
              </View>
              <Card pad={6}>
                {walks.map((w, i) => {
                  const kcal = estWalkKcal({ miles: w.distance, minutes: w.minutes, weightLb });
                  return (
                    <Pressable
                      key={w.id}
                      onLongPress={() => confirmAction('Remove this walk?', `${w.label ?? 'Walk'} · ${prettyDate(w.walk_date)}`, () => removeWalk.mutate(w.id), { confirmText: 'Remove', destructive: true })}
                      delayLongPress={300}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderBottomWidth: i === walks.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <Icon name="walk" size={18} color={t.text3} />
                        <T w={700} size={15} numberOfLines={1} style={{ flex: 1 }}>
                          {w.label ?? 'Walk'}
                          {w.distance ? ` · ${w.distance} mi` : ''}
                        </T>
                      </View>
                      <T num w={700} size={13} color={t.text2}>
                        {[w.minutes ? `${w.minutes} min` : null, kcal > 0 ? `~${kcal} kcal` : null].filter(Boolean).join(' · ')}
                      </T>
                    </Pressable>
                  );
                })}
              </Card>
            </View>
          );
        })
      ) : (
        <T w={600} size={14} color={t.text3}>
          No walks logged yet — tap a preset above.
        </T>
      )}
      {days.length ? (
        <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginTop: 4 }}>
          Calories are an estimate from distance and your weight. Long-press a walk to remove it.
        </T>
      ) : null}

      <ManualWalk visible={manual} weightLb={weightLb} onClose={() => setManual(false)} onSaved={invalidate} />
    </View>
  );
}

function ManualWalk({ visible, weightLb, onClose, onSaved }: { visible: boolean; weightLb: number; onClose: () => void; onSaved: () => void }) {
  const t = useTheme();
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');
  const mi = Number(distance) || 0;
  const min = Number(minutes) || (mi > 0 ? estWalkMinutes(mi) : 0);
  const kcal = estWalkKcal({ miles: mi, minutes: Number(minutes) || null, weightLb });
  const save = async () => {
    await api.walks.manual({ label: label.trim() || 'Walk', minutes: minutes ? Number(minutes) : min || null, distance: distance ? Number(distance) : null, notes: notes || null });
    setLabel('');
    setMinutes('');
    setDistance('');
    setNotes('');
    onSaved();
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a walk">
      <TextField label="Name (optional)" value={label} onChangeText={setLabel} placeholder="e.g. Park loop" autoFocus />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <TextField label="Distance" value={distance} onChangeText={setDistance} keyboardType="numeric" suffix="mi" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="numeric" suffix="min" />
        </View>
      </View>
      {mi > 0 || Number(minutes) > 0 ? (
        <T w={700} size={13} color={t.text2} style={{ marginTop: -4, marginBottom: 12 }}>
          ≈ {min} min{kcal > 0 ? ` · ~${kcal} kcal burned` : ''}
        </T>
      ) : null}
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Treadmill, outside loop…" />
      <Button full size="lg" icon="check" onPress={save}>
        Log walk
      </Button>
    </Sheet>
  );
}
