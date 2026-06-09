// RecipesScreen.tsx — a browsable gallery of low-cal meal ideas with approx calories & cook time.

import React, { useCallback, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, Icon, Screen, SegmentedControl, Sheet, T, TextField } from '../components';
import { api, fileUrl, type Recipe } from '../lib/api';
import { confirmAction } from '../lib/dialog';
import { useTheme } from '../theme';

const BANDS: Record<string, string> = { under_30: '< 30 min', '30_60': '30–60 min', over_60: '1 hr+' };

export function RecipesScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const qc = useQueryClient();
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: () => api.recipes.list() });
  useFocusEffect(useCallback(() => void recipes.refetch(), [recipes.refetch]));
  const [open, setOpen] = useState(false);
  const remove = useMutation({ mutationFn: (id: number) => api.recipes.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }) });

  const tags = (r: Recipe): string[] => {
    try {
      return JSON.parse(r.tags_json);
    } catch {
      return [];
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 16 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="chevL" size={26} color={t.text2} />
        </Pressable>
        <T w={800} size={30}>
          Recipes
        </T>
      </View>

      {recipes.data && recipes.data.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 }}>
          {recipes.data.map((r) => (
            <Pressable
              key={r.id}
              onLongPress={() => confirmAction('Delete recipe?', r.name, () => remove.mutate(r.id), { confirmText: 'Delete', destructive: true })}
              delayLongPress={300}
              style={{ width: '48%' }}
            >
              <Card pad={0} style={{ overflow: 'hidden' }}>
                <View style={{ height: 110, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  {r.photo ? (
                    <Image source={{ uri: fileUrl(`/api/recipes/${r.id}/file`) }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Icon name="food" size={30} color={t.text3} />
                  )}
                </View>
                <View style={{ padding: 12 }}>
                  <T w={800} size={15} numberOfLines={1}>
                    {r.name}
                  </T>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {r.approx_kcal ? (
                      <View style={{ backgroundColor: t.accentSoft, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999 }}>
                        <T num w={800} size={12} color={t.accentPress}>
                          ~{r.approx_kcal} kcal
                        </T>
                      </View>
                    ) : null}
                    {r.cook_band ? (
                      <T w={700} size={12} color={t.text3}>
                        {BANDS[r.cook_band] ?? r.cook_band}
                      </T>
                    ) : null}
                  </View>
                  {tags(r).length ? (
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {tags(r).slice(0, 2).map((tag) => (
                        <View key={tag} style={{ backgroundColor: t.surface2, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 999 }}>
                          <T w={700} size={11} color={t.text2}>
                            {tag}
                          </T>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : (
        <Card>
          <EmptyState icon="food" title="Save meal ideas" body="Add recipes with rough calories and a cook time to browse when you need inspiration." />
        </Card>
      )}

      <View style={{ marginTop: 16 }}>
        <Button full size="lg" icon="plus" onPress={() => setOpen(true)}>
          Add recipe
        </Button>
      </View>

      <RecipeForm visible={open} onClose={() => setOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['recipes'] })} />
    </Screen>
  );
}

function RecipeForm({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useTheme();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [band, setBand] = useState('under_30');
  const [tags, setTags] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets?.[0]) setPhotoUri(res.assets[0].uri);
  };

  const save = async () => {
    if (!name.trim()) return;
    const form = new FormData();
    form.append('name', name.trim());
    if (kcal) form.append('approx_kcal', kcal);
    form.append('cook_band', band);
    if (tags) form.append('tags', tags);
    if (ingredients) form.append('ingredients', ingredients);
    if (photoUri) form.append('photo', { uri: photoUri, name: 'recipe.jpg', type: 'image/jpeg' } as any);
    await api.recipes.create(form);
    setName('');
    setKcal('');
    setTags('');
    setIngredients('');
    setPhotoUri(null);
    onSaved();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add recipe">
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Turkey chili" autoFocus />
      <TextField label="Approx calories" value={kcal} onChangeText={setKcal} keyboardType="numeric" suffix="kcal" />
      <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
        Cook time
      </T>
      <View style={{ marginBottom: 14 }}>
        <SegmentedControl options={['under_30', '30_60', 'over_60']} value={band} onChange={setBand} />
      </View>
      <TextField label="Tags (comma separated)" value={tags} onChangeText={setTags} placeholder="low-cal, high-protein" />
      <TextField label="Ingredients / notes" value={ingredients} onChangeText={setIngredients} placeholder="What's in it…" multiline />
      <Pressable onPress={pickPhoto} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: t.hairline, marginBottom: 16 }}>
        {photoUri ? <Image source={{ uri: photoUri }} style={{ width: 48, height: 48, borderRadius: 10 }} /> : <Icon name="camera" size={22} color={t.accentPress} />}
        <T w={800} size={15} color={t.text2}>
          {photoUri ? 'Photo added' : 'Add a photo (optional)'}
        </T>
      </Pressable>
      <Button full size="lg" icon="check" onPress={save}>
        Save recipe
      </Button>
    </Sheet>
  );
}
