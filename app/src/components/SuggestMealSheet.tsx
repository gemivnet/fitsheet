// SuggestMealSheet.tsx — "what should I eat?" decision help. Streams 2–3 ideas that fit her
// remaining calories (from the server, grounded in her foods/recipes), each loggable in one tap.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiBase, type MealSuggestion } from '../lib/api';
import { todayStr } from '../lib/date';
import { FontSize, useTheme } from '../theme';
import { Button, Card, T } from './primitives';
import { CatSprite } from './Marmalade';
import { Sheet } from './forms';
import { showToast } from './Toast';

const SLOT_LABEL: Record<string, string> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snacks: 'a snack' };

export function SuggestMealSheet({ visible, slot, date, onClose }: { visible: boolean; slot: string; date: string; onClose: () => void }) {
  const t = useTheme();
  const qc = useQueryClient();
  const [items, setItems] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setItems([]);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/ai/suggest-meal-stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot, date }),
        });
        if (res.status === 503) {
          if (!cancelled) {
            setError('AI is off — add ANTHROPIC_API_KEY on the server.');
            setLoading(false);
          }
          return;
        }
        const reader = (res as any).body?.getReader?.();
        if (!reader) {
          const out = await api.ai.suggestMeal(slot, date);
          if (!cancelled) {
            setItems(out.suggestions);
            setLoading(false);
          }
          return;
        }
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.replace(/^data:\s*/, '').trim();
            if (!line) continue;
            let msg: any;
            try {
              msg = JSON.parse(line);
            } catch {
              continue;
            }
            if (msg.suggestion && !cancelled) setItems((a) => [...a, msg.suggestion as MealSuggestion]);
            if (msg.error && !cancelled) setError('Couldn’t think of something just now — try again.');
            if (msg.done && !cancelled) setLoading(false);
          }
        }
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Couldn’t reach the server.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, slot, date]);

  const logIt = async (s: MealSuggestion) => {
    const g = s.grams > 0 ? s.grams : 100;
    try {
      await api.foodLog.add({
        date,
        meal_slot: s.slot || slot,
        name: s.name,
        grams: g,
        kcal_100g: Math.round((s.kcal / g) * 100),
        protein_100g: Math.round((s.protein_g / g) * 1000) / 10,
        carb_100g: Math.round((s.carb_g / g) * 1000) / 10,
        fat_100g: Math.round((s.fat_g / g) * 1000) / 10,
      });
    } catch {
      showToast('Couldn’t log that — try again', { kind: 'error' });
      return;
    }
    qc.invalidateQueries({ queryKey: ['foodlog', date] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    showToast(`${s.name} logged 🐾`);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="What should I eat?">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <CatSprite size={30} />
        <T w={700} size={FontSize.meta} color={t.text2} style={{ flex: 1 }}>
          Ideas for {SLOT_LABEL[slot] ?? slot} that fit what you’ve got left today.
        </T>
      </View>

      {items.map((s, i) => (
        <Card key={i} pad={14} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={800} size={FontSize.body} numberOfLines={2}>
                {s.name}
              </T>
              <T num w={700} size={FontSize.caption} color={t.text3} style={{ marginTop: 2 }}>
                {Math.round(s.kcal)} kcal · P {Math.round(s.protein_g)} · C {Math.round(s.carb_g)} · F {Math.round(s.fat_g)}
              </T>
              {s.rationale ? (
                <T w={600} size={FontSize.caption} color={t.text2} style={{ marginTop: 4, lineHeight: 17 }}>
                  {s.rationale}
                </T>
              ) : null}
            </View>
            <Button variant="success" icon="check" size="sm" onPress={() => logIt(s)}>
              Log it
            </Button>
          </View>
        </Card>
      ))}

      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
          <ActivityIndicator color={t.accent} />
          <T w={700} size={FontSize.meta} color={t.text2}>
            {items.length ? 'Thinking of more…' : 'Looking at what fits…'}
          </T>
        </View>
      ) : null}
      {error ? (
        <T w={700} size={FontSize.meta} color={t.caution} style={{ paddingVertical: 8 }}>
          {error}
        </T>
      ) : !loading && !items.length ? (
        <Pressable onPress={onClose} style={{ paddingVertical: 8 }}>
          <T w={600} size={FontSize.meta} color={t.text3}>
            Nothing to suggest right now — you’re all set 🐾
          </T>
        </Pressable>
      ) : null}
    </Sheet>
  );
}
