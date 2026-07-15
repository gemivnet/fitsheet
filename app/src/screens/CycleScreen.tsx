// CycleScreen.tsx — period tracking: predictions up top, then editable history.
// Dates are logged as plain YYYY-MM-DD; back-dating happens by editing an entry here.

import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, Screen, ScreenHeader, SectionLabel, Sheet, showToast, T, TextField, WeightChart } from '../components';
import { api, type CycleEntry } from '../lib/api';
import { addDaysStr, prettyDate, todayStr } from '../lib/date';
import { confirmAction } from '../lib/dialog';
import { useTheme } from '../theme';

const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86400000);

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 130 }}>
      <SectionLabel>{label}</SectionLabel>
      <T w={800} size={17} style={{ marginTop: 4 }}>
        {value}
      </T>
      {hint ? (
        <T w={700} size={12} color={t.text3}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function CycleScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ['cycle-summary'], queryFn: api.cycle.summary });
  const entries = useQuery({ queryKey: ['cycle'], queryFn: api.cycle.list });
  const [editing, setEditing] = useState<CycleEntry | null>(null);
  const [adding, setAdding] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cycle'] });
    qc.invalidateQueries({ queryKey: ['cycle-summary'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const remove = useMutation({ mutationFn: (id: number) => api.cycle.remove(id), onSuccess: invalidate });

  const s = summary.data;
  const today = todayStr();
  // history arrives newest-first; gaps need chronological neighbours
  const asc = [...(entries.data ?? [])].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const gapFor = (e: CycleEntry): number | null => {
    const i = asc.findIndex((x) => x.id === e.id);
    return i > 0 ? daysBetween(asc[i - 1].start_date, e.start_date) : null;
  };
  const chartPoints = asc
    .map((e, i) => ({ e, gap: i > 0 && !e.estimated && !asc[i - 1].estimated ? daysBetween(asc[i - 1].start_date, e.start_date) : null }))
    .filter((p): p is { e: CycleEntry; gap: number } => p.gap != null)
    .slice(-12)
    .map((p, i) => ({ x: i, raw: p.gap, trend: s?.avg_cycle_days ?? p.gap, date: p.e.start_date }));

  return (
    <Screen>
      <ScreenHeader title="Cycle" onBack={() => nav.goBack()} />

      <Card pad={18} style={{ marginBottom: 14 }}>
        {!s || s.reason ? (
          <>
            <SectionLabel>Predictions</SectionLabel>
            <T w={700} size={15} style={{ marginTop: 8, lineHeight: 22 }}>
              Log a few periods (or import your history) and predictions will appear here — next expected start, average cycle, the works.
            </T>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <SectionLabel>Predictions</SectionLabel>
              {s.confidence ? (
                <View style={{ marginLeft: 'auto' }}>
                  <Chip soft={t.accentSofter} color={t.accentPress}>
                    {s.confidence} confidence
                  </Chip>
                </View>
              ) : null}
            </View>
            {s.open_entry ? (
              <T w={800} size={17} style={{ marginBottom: 12 }}>
                Period in progress — started {prettyDate(s.open_entry.start_date)}
              </T>
            ) : s.predicted_start ? (
              <T w={800} size={17} style={{ marginBottom: 12 }}>
                {s.is_late
                  ? `Expected ${prettyDate(s.predicted_start)} — running a little late`
                  : daysBetween(today, s.predicted_start) >= 0
                    ? `Next expected ${prettyDate(s.predicted_start)} (${daysBetween(today, s.predicted_start) === 0 ? 'today' : `in ${daysBetween(today, s.predicted_start)} days`})`
                    : `Expected ${prettyDate(s.predicted_start)}`}
              </T>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              <Stat label="Avg cycle" value={s.avg_cycle_days != null ? `${s.avg_cycle_days} days` : '—'} hint={`over ${s.n_cycles} cycles`} />
              <Stat label="Avg period" value={s.avg_duration_days != null ? `${s.avg_duration_days} days` : '—'} />
              {s.concern_date && !s.open_entry ? <Stat label="Check-in date" value={prettyDate(s.concern_date)} hint="when it'd count as late" /> : null}
            </View>
          </>
        )}
      </Card>

      {chartPoints.length >= 3 ? (
        <Card pad={18} style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 10 }}>Cycle length</SectionLabel>
          <WeightChart data={chartPoints} height={160} fmtY={(d) => `${Math.round(d)}d`} />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <SectionLabel>History</SectionLabel>
        <View style={{ marginLeft: 'auto' }}>
          <Button size="sm" icon="plus" onPress={() => setAdding(true)}>
            Log a period
          </Button>
        </View>
      </View>

      {entries.data && entries.data.length ? (
        <Card pad={6} style={{ marginBottom: 20 }}>
          {entries.data.map((e, i) => {
            const gap = gapFor(e);
            return (
              <Pressable
                key={e.id}
                onPress={() => setEditing(e)}
                onLongPress={() =>
                  confirmAction('Delete this period?', prettyDate(e.start_date), () => remove.mutate(e.id), { confirmText: 'Delete', destructive: true })
                }
                delayLongPress={300}
                style={{ padding: 14, borderBottomWidth: i === entries.data.length - 1 ? 0 : 1, borderBottomColor: t.hairline }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T w={800} size={15}>
                    {prettyDate(e.start_date)}
                    {e.end_date ? ` – ${prettyDate(e.end_date)}` : ''}
                  </T>
                  {e.end_date == null ? (
                    <Chip soft={t.accentSofter} color={t.accentPress}>
                      in progress
                    </Chip>
                  ) : null}
                  {e.estimated ? (
                    <Chip soft={t.cautionSoft} color={t.caution}>
                      estimated
                    </Chip>
                  ) : null}
                </View>
                <T w={700} size={12} color={t.text3} style={{ marginTop: 3 }}>
                  {e.end_date ? `${daysBetween(e.start_date, e.end_date) + 1} days` : `day ${daysBetween(e.start_date, today) + 1}`}
                  {gap != null ? ` · ${gap} days since last` : ''}
                </T>
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <EmptyState title="No periods logged yet" body="Log one with the button above — or ask for your history to be imported." />
      )}

      <EntrySheet
        entry={editing}
        open={adding || editing != null}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={invalidate}
      />
    </Screen>
  );
}

function EntrySheet({ entry, open, onClose, onSaved }: { entry: CycleEntry | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTheme();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [err, setErr] = useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setStart(entry?.start_date ?? todayStr());
      setEnd(entry?.end_date ?? '');
      setErr(null);
    }
  }, [open, entry]);

  const save = useMutation({
    mutationFn: () => {
      const p = { start_date: start.trim(), end_date: end.trim() ? end.trim() : null };
      return entry ? api.cycle.update(entry.id, p) : api.cycle.add(p);
    },
    onSuccess: () => {
      onSaved();
      onClose();
      showToast('Noted 🐾');
    },
    onError: (e: Error) => setErr(e.message),
  });
  const canSave = isDay(start.trim()) && (!end.trim() || isDay(end.trim())) && !save.isPending;

  const stepper = (value: string, set: (v: string) => void) => (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: -6, marginBottom: 14 }}>
      <Button size="sm" variant="soft" onPress={() => isDay(value) && set(addDaysStr(value, -1))}>
        − day
      </Button>
      <Button size="sm" variant="soft" onPress={() => isDay(value) && set(addDaysStr(value, 1))}>
        + day
      </Button>
      <Button size="sm" variant="soft" onPress={() => set(todayStr())}>
        Today
      </Button>
    </View>
  );

  return (
    <Sheet visible={open} onClose={onClose} title={entry ? 'Edit period' : 'Log a period'}>
      <TextField label="Started (YYYY-MM-DD)" value={start} onChangeText={setStart} placeholder={todayStr()} />
      {stepper(start, setStart)}
      <TextField label="Ended (blank = still going)" value={end} onChangeText={setEnd} placeholder="" />
      {stepper(end || start, setEnd)}
      {err ? (
        <T w={700} size={13} color={t.caution} style={{ marginBottom: 10 }}>
          {err}
        </T>
      ) : null}
      <Button full icon="check" style={canSave ? undefined : { opacity: 0.5 }} onPress={() => canSave && save.mutate()}>
        Save
      </Button>
    </Sheet>
  );
}
