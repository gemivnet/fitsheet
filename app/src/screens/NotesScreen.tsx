// NotesScreen.tsx — dated journal entries with an optional mood.

import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, Icon, Screen, Sheet, T, TextField } from '../components';
import { api } from '../lib/api';
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

  const remove = useMutation({ mutationFn: (id: number) => api.notes.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }) });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => nav.goBack()} hitSlop={10}>
            <Icon name="chevL" size={26} color={t.text2} />
          </Pressable>
          <T w={800} size={30}>
            Journal
          </T>
        </View>
      </View>

      {notes.data && notes.data.length ? (
        notes.data.map((n) => (
          <Card key={n.id} pad={16} style={{ marginBottom: 12 }}>
            <Pressable onLongPress={() => confirmAction('Delete note?', '', () => remove.mutate(n.id), { confirmText: 'Delete', destructive: true })} delayLongPress={300}>
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
    </Screen>
  );
}

function NoteForm({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [body, setBody] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const save = async () => {
    if (!body.trim()) return;
    await api.notes.create({ body: body.trim(), mood, note_date: todayStr() });
    setBody('');
    setMood(null);
    onSaved();
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="New note">
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        {MOODS.map((m) => (
          <Chip key={m.key} active={mood === m.key} onPress={() => setMood(m.key)}>
            {m.emoji}
          </Chip>
        ))}
      </View>
      <TextField label="Note" value={body} onChangeText={setBody} placeholder="How are you feeling today?" multiline autoFocus />
      <Button full size="lg" icon="check" onPress={save}>
        Save note
      </Button>
    </Sheet>
  );
}
