// LabelCaptureScreen.tsx — snap a nutrition label → server runs Claude vision → prefill an
// editable custom food → save (and optionally log it). Falls back to manual entry if AI is off.

import React, { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Icon, Screen, SectionLabel, T, TextField } from '../components';
import { api } from '../lib/api';
import { Font, useTheme } from '../theme';
import type { FoodStackParams } from '../navigation/types';

type Props = NativeStackScreenProps<FoodStackParams, 'LabelCapture'>;

export function LabelCaptureScreen({ navigation, route }: Props) {
  const t = useTheme();
  const qc = useQueryClient();
  const { slot, date } = route.params;

  const [phase, setPhase] = useState<'capture' | 'busy' | 'form'>('capture');
  const [labelPhoto, setLabelPhoto] = useState<string | null>(null);
  const [lowConf, setLowConf] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [servingG, setServingG] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carb, setCarb] = useState('');
  const [fat, setFat] = useState('');

  async function pick(from: 'camera' | 'library') {
    // On web there's no launchCameraAsync; the library picker offers the camera on mobile Safari.
    const useLibrary = from === 'library' || Platform.OS === 'web';
    const res = useLibrary
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 })
      : await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setPhase('busy');
    const form = new FormData();
    form.append('file', { uri: asset.uri, name: 'label.jpg', type: asset.mimeType ?? 'image/jpeg' } as any);
    try {
      const out = await api.ai.extractLabel(form);
      setLabelPhoto(out.label_photo ?? null);
      const n = out.nutrition;
      if (n) {
        setName(n.name ?? '');
        setServingG(n.serving_g != null ? String(n.serving_g) : '');
        const per = n.per_serving ?? n.per_100g;
        if (per) {
          setKcal(String(Math.round(per.kcal)));
          setProtein(String(per.protein_g));
          setCarb(String(per.carb_g));
          setFat(String(per.fat_g));
        }
        setLowConf(out.confidence === 'low');
        setAiNote(out.confidence === 'low' ? 'A few fields were blurry — please double-check them.' : 'We read this from your label — give it a quick check.');
      } else {
        setAiNote(out.error === 'no_api_key' ? 'AI is off — enter the numbers from the label.' : "Couldn't read it automatically — enter the numbers below.");
      }
    } catch {
      setAiNote("Couldn't reach the server — enter the numbers below.");
    }
    setPhase('form');
  }

  async function save(alsoLog: boolean) {
    const sg = Number(servingG) || 0;
    const factor = sg > 0 ? 100 / sg : 1; // entered values are per-serving when we know the serving
    const per100 = {
      kcal_100g: Math.round((Number(kcal) || 0) * factor),
      protein_100g: Math.round((Number(protein) || 0) * factor),
      carb_100g: Math.round((Number(carb) || 0) * factor),
      fat_100g: Math.round((Number(fat) || 0) * factor),
    };
    const food = await api.foods.create({
      name: name || 'Custom food',
      source: 'ai_label',
      serving_g: sg || null,
      label_photo: labelPhoto,
      is_favorite: alsoLog ? 0 : 1,
      ...per100,
    } as any);
    if (alsoLog) {
      await api.foodLog.add({ date, meal_slot: slot, food_id: food.id, name: food.name, grams: sg || 100, ...per100 });
      qc.invalidateQueries({ queryKey: ['foodlog', date] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
    qc.invalidateQueries({ queryKey: ['foods'] });
    navigation.goBack();
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 16 }}>
        <T w={800} size={26}>
          {phase === 'form' ? 'Check the details' : 'Custom food'}
        </T>
        <Pressable onPress={() => navigation.goBack()}>
          <T w={800} size={16} color={t.accentPress}>
            Cancel
          </T>
        </Pressable>
      </View>

      {phase === 'capture' ? (
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={{ width: 72, height: 72, borderRadius: 999, backgroundColor: t.accentSofter, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="camera" size={32} color={t.accentPress} />
            </View>
            <T w={800} size={18} style={{ marginBottom: 6 }}>
              Snap the nutrition label
            </T>
            <T w={600} size={15} color={t.text2} style={{ textAlign: 'center', maxWidth: 280, lineHeight: 22, marginBottom: 18 }}>
              We&rsquo;ll read the calories and macros for you. You can fix anything before saving.
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button icon="camera" onPress={() => pick('camera')}>
                Take photo
              </Button>
              <Button variant="soft" onPress={() => pick('library')}>
                Choose photo
              </Button>
            </View>
            <Pressable onPress={() => setPhase('form')} style={{ marginTop: 16 }}>
              <T w={800} size={14} color={t.text3}>
                Enter manually instead
              </T>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {phase === 'busy' ? (
        <Card>
          <T w={700} size={16} style={{ textAlign: 'center', paddingVertical: 24 }} color={t.text2}>
            Reading your label…
          </T>
        </Card>
      ) : null}

      {phase === 'form' ? (
        <View>
          {aiNote ? (
            <View style={{ flexDirection: 'row', gap: 12, padding: 16, borderRadius: 16, backgroundColor: t.accentSofter, marginBottom: 16, alignItems: 'flex-start' }}>
              <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="star" size={17} color="#fff" fill="#fff" />
              </View>
              <T w={700} size={14} style={{ flex: 1, lineHeight: 20 }}>
                {aiNote}
              </T>
            </View>
          ) : null}

          <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Aldi Crunchy Oat Cereal" />
          <TextField label="Serving size" value={servingG} onChangeText={setServingG} keyboardType="numeric" suffix="grams" />
          <SectionLabel style={{ marginBottom: 10, marginTop: 4 }}>Per serving</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <NumField label="Calories" value={kcal} onChange={setKcal} unit="kcal" flagged={lowConf} />
            </View>
            <View style={{ flex: 1 }}>
              <NumField label="Protein" value={protein} onChange={setProtein} unit="g" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <NumField label="Carbs" value={carb} onChange={setCarb} unit="g" flagged={lowConf} />
            </View>
            <View style={{ flex: 1 }}>
              <NumField label="Fat" value={fat} onChange={setFat} unit="g" />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Button variant="ghost" icon="star" full onPress={() => save(false)}>
                Save &amp; favorite
              </Button>
            </View>
            <View style={{ flex: 1.3 }}>
              <Button variant="primary" icon="check" full onPress={() => save(true)}>
                Add to {slot}
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function NumField({ label, value, onChange, unit, flagged }: { label: string; value: string; onChange: (v: string) => void; unit: string; flagged?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
        {label}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: 13, paddingHorizontal: 14, borderWidth: flagged ? 2 : 1.5, borderColor: flagged ? t.caution : t.hairline }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={t.text3}
          style={{ flex: 1, fontFamily: Font[800], fontSize: 20, color: t.text, paddingVertical: 12 }}
        />
        <T w={700} size={13} color={t.text3}>
          {unit}
        </T>
        {flagged ? <Icon name="edit" size={16} color={t.caution} /> : null}
      </View>
    </View>
  );
}
