// ActivityScreen.tsx — Workouts (plan / open link / complete / ad-hoc) + Walks (preset one-tap / manual).

import React, { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, Icon, Screen, SectionLabel, SegmentedControl, Sheet, showToast, T, TextField } from '../components';
import { api, type WalkPreset, type Workout } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import { addDaysStr, prettyDate, todayStr } from '../lib/date';
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

function Walks() {
  const t = useTheme();
  const qc = useQueryClient();
  const presets = useQuery({ queryKey: ['walks', 'presets'], queryFn: api.walks.presets });
  const log = useQuery({ queryKey: ['walks', 'log'], queryFn: () => api.walks.log(addDaysStr(todayStr(), -30), todayStr()) });
  useFocusEffect(useCallback(() => void log.refetch(), [log.refetch]));
  const [manual, setManual] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['walks', 'log'] });
  const quick = useMutation({ mutationFn: (p: WalkPreset) => api.walks.quick(p.id), onSuccess: invalidate });
  const removeWalk = useMutation({ mutationFn: (id: number) => api.walks.removeLog(id), onSuccess: invalidate });

  return (
    <View>
      <SectionLabel style={{ marginBottom: 10 }}>Tap to log a walk</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {presets.data?.map((p) => (
          <Chip key={p.id} icon="walk" onPress={() => quick.mutate(p)}>
            {p.label}
            {p.default_minutes ? ` · ${p.default_minutes}m` : ''}
          </Chip>
        ))}
        <Chip icon="plus" soft={t.accentSoft} color={t.accentPress} onPress={() => setManual(true)}>
          Manual
        </Chip>
      </View>

      <SectionLabel style={{ marginBottom: 10 }}>Recent</SectionLabel>
      {log.data && log.data.length ? (
        <Card pad={6}>
          {log.data.slice(0, 12).map((w, i) => (
            <Pressable
              key={w.id}
              onLongPress={() => confirmAction('Remove this walk?', `${w.label ?? 'Walk'} · ${prettyDate(w.walk_date)}`, () => removeWalk.mutate(w.id), { confirmText: 'Remove', destructive: true })}
              delayLongPress={300}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: i === Math.min(11, log.data!.length - 1) ? 0 : 1, borderBottomColor: t.hairline }}
            >
              <View>
                <T w={800} size={15}>
                  {w.label ?? 'Walk'}
                </T>
                <T w={700} size={13} color={t.text3}>
                  {prettyDate(w.walk_date)}
                </T>
              </View>
              <T num w={700} size={14} color={t.text2}>
                {w.minutes ? `${w.minutes} min` : ''}
                {w.distance ? `  ${w.distance} mi` : ''}
              </T>
            </Pressable>
          ))}
        </Card>
      ) : (
        <T w={600} size={14} color={t.text3}>
          No walks logged yet — tap a preset above.
        </T>
      )}
      {log.data && log.data.length ? (
        <T w={600} size={12} color={t.text3} style={{ textAlign: 'center', marginTop: 10 }}>
          Long-press a walk to remove it.
        </T>
      ) : null}

      <ManualWalk visible={manual} onClose={() => setManual(false)} onSaved={invalidate} />
    </View>
  );
}

function ManualWalk({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [notes, setNotes] = useState('');
  const save = async () => {
    await api.walks.manual({ label: 'Walk', minutes: minutes ? Number(minutes) : null, distance: distance ? Number(distance) : null, notes: notes || null });
    setMinutes('');
    setDistance('');
    setNotes('');
    onSaved();
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a walk">
      <TextField label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="numeric" suffix="min" autoFocus />
      <TextField label="Distance (optional)" value={distance} onChangeText={setDistance} keyboardType="numeric" suffix="mi" />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Treadmill, outside loop…" />
      <Button full size="lg" icon="check" onPress={save}>
        Log walk
      </Button>
    </Sheet>
  );
}
