// LogWeightScreen.tsx — modal to log today's weight (+ optional note & progress photo).
// Shows the milestone celebration immediately when the trend crosses a threshold.

import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, CelebrationModal, Icon, Screen, T, TextField } from '../components';
import { api } from '../lib/api';
import { appendImage } from '../lib/upload';
import { todayStr } from '../lib/date';
import { fromDisplayWeight } from '../lib/units';
import { useTheme } from '../theme';
import type { WeightStackParams } from '../navigation/types';

type Props = NativeStackScreenProps<WeightStackParams, 'LogWeight'>;

export function LogWeightScreen({ navigation }: Props) {
  const t = useTheme();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const units = settings.data?.units ?? 'lb';

  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState<number | null>(null);

  async function addPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets?.[0]) setPhotoUri(res.assets[0].uri);
  }

  async function save() {
    const display = Number(weight);
    if (!display || display <= 0) return;
    setSaving(true);
    try {
      const lb = fromDisplayWeight(display, units);
      const out = await api.weight.log({ weight_lb: Math.round(lb * 10) / 10, note: note || undefined });
      if (photoUri) {
        const form = new FormData();
        await appendImage(form, 'file', photoUri, { name: 'progress.jpg' });
        form.append('taken_date', todayStr());
        form.append('entry_id', String(out.entry.id));
        await api.weightPhotos.upload(form).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ['weight'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      if (out.milestones && out.milestones.length) {
        setCelebrate(out.milestones[out.milestones.length - 1].threshold_lb);
      } else {
        navigation.goBack();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 20 }}>
        <T w={800} size={26}>
          Log weight
        </T>
        <Pressable onPress={() => navigation.goBack()}>
          <T w={800} size={16} color={t.accentPress}>
            Cancel
          </T>
        </Pressable>
      </View>

      <TextField label={`Today's weight (${units})`} value={weight} onChangeText={setWeight} keyboardType="numeric" suffix={units} autoFocus />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="How are you feeling?" multiline />

      <Pressable onPress={addPhoto} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: t.hairline, backgroundColor: t.surface, marginBottom: 20 }}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: 48, height: 60, borderRadius: 10 }} />
        ) : (
          <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" size={22} color={t.accentPress} />
          </View>
        )}
        <T w={800} size={15} color={t.text2}>
          {photoUri ? 'Progress photo added — tap to change' : 'Add a progress photo (optional)'}
        </T>
      </Pressable>

      <Button full size="lg" icon="check" onPress={save}>
        {saving ? 'Saving…' : 'Save'}
      </Button>

      {celebrate != null ? (
        <CelebrationModal
          visible
          kpi={`−${celebrate}`}
          title={`${celebrate} pounds down!`}
          body="That's a real milestone — beautifully done. Keep showing up."
          cta="Keep it up!"
          onClose={() => {
            setCelebrate(null);
            navigation.goBack();
          }}
        />
      ) : null}
    </Screen>
  );
}
