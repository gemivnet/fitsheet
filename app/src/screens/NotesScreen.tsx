// NotesScreen.tsx — dated journal entries with an optional mood.

import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, Screen, ScreenHeader, Sheet, showToast, T, TextField } from '../components';
import { api, type Note } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import { prettyDate, todayStr } from '../lib/date';
import { useTheme } from '../theme';

const MOODS: { key: string; emoji: string }[] = [
  { key: 'great', emoji: '😄' },
  { key: 'good', emoji: '🙂' },
  { key: 'ok', emoji: '😐' },
  { key: 'low', emoji: '😕' },
  { key: 'rough', emoji: '😣' },
];
const emojiFor = (m: string | null) => MOODS.find((x) => x.key === m)?.emoji ?? '📝';

export function NotesScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const qc = useQueryClient();
  const notes = useQuery({ queryKey: ['notes'], queryFn: api.notes.list });
  useFocusEffect(useCallback(() => void notes.refetch(), [notes.refetch]));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  const remove = useMutation({ mutationFn: (id: number) => api.notes.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }) });

  return (
    <Screen>
      <ScreenHeader title="Journal" onBack={() => nav.goBack()} />

      {notes.data && notes.data.length ? (
        notes.data.map((n) => (
          <Card key={n.id} pad={16} style={{ marginBottom: 12 }}>
            <Pressable
              onPress={() => setEditing(n)}
              onLongPress={() => confirmAction('Delete note?', '', () => remove.mutate(n.id), { confirmText: 'Delete', destructive: true })}
              delayLongPress={300}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <T size={18}>{emojiFor(n.mood)}</T>
                <T w={800} size={13} color={t.text3}>
                  {prettyDate(n.note_date)}
                </T>
              </View>
              <T w={600} size={15} style={{ lineHeight: 22 }}>
                {n.body}
              </T>
            </Pressable>
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState icon="edit" title="Your journal" body="Jot how you're feeling or anything you want to remember." />
        </Card>
      )}

      <View style={{ marginTop: 8 }}>
        <Button full size="lg" icon="plus" onPress={() => setOpen(true)}>
          New note
        </Button>
      </View>

      <NoteForm visible={open} onClose={() => setOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['notes'] })} />
      <NoteForm visible={!!editing} initial={editing} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['notes'] })} />
    </Screen>
  );
}

function NoteForm({ visible, initial, onClose, onSaved }: { visible: boolean; initial?: Note | null; onClose: () => void; onSaved: () => void }) {
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  React.useEffect(() => {
    if (!visible) return;
    setBody(initial?.body ?? '');
    setMood(initial?.mood ?? null);
  }, [visible, initial]);

  const save = async () => {
    if (!body.trim()) return;
    try {
      if (initial) await api.notes.update(initial.id, { body: body.trim(), mood });
      else await api.notes.create({ body: body.trim(), mood, note_date: todayStr() });
    } catch {
      showToast('Couldn’t save that — try again', { kind: 'error' });
      return;
    }
    setBody('');
    setMood(null);
    onSaved();
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? 'Edit note' : 'New note'}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {MOODS.map((m) => (
          <Chip key={m.key} active={mood === m.key} onPress={() => setMood(m.key)}>
            {m.emoji}
          </Chip>
        ))}
      </View>
      <TextField label="Note" value={body} onChangeText={setBody} placeholder="How are you feeling today?" multiline autoFocus={!initial} />
      <Button full size="lg" icon="check" onPress={save}>
        {initial ? 'Save changes' : 'Save note'}
      </Button>
    </Sheet>
  );
}
