// MarmaladeChatScreen.tsx — talk to Marmalade in the moment. For when a decision is wobbling
// ("McDonald's after Chipotle?") and you want a warm, honest friend to talk it through. She's
// grounded in today's real numbers server-side; the conversation lives for the session.

import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, CatSprite, Chip, Icon, showToast, SuggestMealSheet, T } from '../components';
import { api, type ChatAction, type ChatTurn } from '../lib/api';
import { slotForNow, todayStr } from '../lib/date';
import { navigate } from '../navigation/ref';
import { Font, useTheme } from '../theme';

const goScreen = (screen: NonNullable<ChatAction['screen']>) => {
  if (screen === 'day') navigate('Food', { screen: 'FoodDay' });
  else if (screen === 'weight') navigate('Weight', { screen: 'Weight' });
  else if (screen === 'analytics') navigate('More', { screen: 'Analytics' });
  else if (screen === 'mealplan') navigate('More', { screen: 'MealPlan' });
  else if (screen === 'goals') navigate('More', { screen: 'Goals' });
};

export function MarmaladeChatScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [action, setAction] = useState<ChatAction | null>(null);
  const [suggest, setSuggest] = useState<string | null>(null); // slot when the suggest sheet is open
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const chat = useMutation({
    mutationFn: (history: ChatTurn[]) => api.ai.chat(history, todayStr()),
    onSuccess: (out) => {
      setMessages((m) => [...m, { role: 'assistant', content: out.reply || 'Mrrp?' }]);
      const a = out.action && out.action.kind !== 'none' ? out.action : null;
      if (a?.kind === 'suggest_meal') {
        setSuggest(a.slot || slotForNow()); // safe action — just open ideas
        setAction(null);
      } else {
        setAction(a);
      }
    },
    onError: () => setMessages((m) => [...m, { role: 'assistant', content: 'Mrrp — I lost my words for a second. Try me again? 🐾' }]),
    meta: { suppressErrorToast: true },
  });

  // Marmalade opens the conversation with a situation-aware hello.
  useEffect(() => {
    chat.mutate([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const id = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages, chat.isPending, action]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean || chat.isPending) return;
    const next: ChatTurn[] = [...messages, { role: 'user', content: clean }];
    setMessages(next);
    setInput('');
    setAction(null); // a new turn supersedes any pending action
    chat.mutate(next);
  };
  const onSend = () => send(input);

  // execute a confirmed write
  const doLogFood = async (a: ChatAction) => {
    const items = a.items ?? [];
    setBusy(true);
    let n = 0;
    for (const it of items) {
      const g = it.grams > 0 ? it.grams : 100;
      try {
        await api.foodLog.add({
          date: todayStr(),
          meal_slot: a.slot || slotForNow(),
          name: it.name,
          grams: g,
          kcal_100g: Math.round((it.kcal / g) * 100),
          protein_100g: Math.round((it.protein_g / g) * 1000) / 10,
          carb_100g: Math.round((it.carb_g / g) * 1000) / 10,
          fat_100g: Math.round((it.fat_g / g) * 1000) / 10,
        });
        n++;
      } catch {
        /* keep going */
      }
    }
    qc.invalidateQueries({ queryKey: ['foodlog', todayStr()] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    setBusy(false);
    setAction(null);
    showToast(n ? `Logged ${n} ✓` : 'Couldn’t log that — try again', n ? {} : { kind: 'error' });
    setMessages((m) => [...m, { role: 'assistant', content: n ? 'Done — logged for you 🐾' : 'That didn’t save, sorry. Want to try again?' }]);
  };
  const doGeneratePlan = async (a: ChatAction) => {
    setBusy(true);
    try {
      await api.ai.mealPlan.generate({ days: a.days || 7, guidance: a.guidance || '' });
      showToast('Your plan is ready 🐾');
      setAction(null);
      setBusy(false);
      navigate('More', { screen: 'MealPlan' });
    } catch {
      setBusy(false);
      showToast('Couldn’t plan that — try again', { kind: 'error' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.hairline }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="chevL" size={26} color={t.text2} />
        </Pressable>
        <CatSprite size={34} />
        <View>
          <T w={800} size={18}>
            Marmalade
          </T>
          <T w={700} size={12} color={t.text3}>
            here for the tricky moments
          </T>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 8}>
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.content} />
          ))}
          {chat.isPending ? <Bubble role="assistant" text="…" thinking /> : null}
        </ScrollView>

        {/* action she offered — writes get a confirm; navigation is one tap */}
        {action ? (
          <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
            {action.kind === 'log_food' ? (
              <ActionConfirm label={`Log ${(action.items ?? []).map((i) => i.name).join(', ') || 'this'}?`} cta="Log it" busy={busy} onConfirm={() => doLogFood(action)} onCancel={() => setAction(null)} />
            ) : action.kind === 'generate_plan' ? (
              <ActionConfirm label={`Plan ${action.days || 7} days of meals?`} cta="Plan it" busy={busy} onConfirm={() => doGeneratePlan(action)} onCancel={() => setAction(null)} />
            ) : action.kind === 'navigate' && action.screen ? (
              <Button
                variant="soft"
                full
                icon="chevR"
                onPress={() => {
                  goScreen(action.screen!);
                  setAction(null);
                }}
              >
                Take me there
              </Button>
            ) : null}
          </View>
        ) : null}

        {/* starter chips — advertise what she can do */}
        {messages.length <= 1 && !chat.isPending ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
            <Chip icon="food" onPress={() => setSuggest(slotForNow())}>
              What should I eat?
            </Chip>
            <Chip icon="flame" onPress={() => send('Plan my meals for the week')}>
              Plan my week
            </Chip>
          </View>
        ) : null}

        {/* input */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 8, borderTopWidth: 1, borderTopColor: t.hairline, backgroundColor: t.surface }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Tell Marmalade what's up…"
            placeholderTextColor={t.text3}
            multiline
            onSubmitEditing={onSend}
            style={{ flex: 1, maxHeight: 120, fontFamily: Font[600], fontSize: 15, color: t.text, backgroundColor: t.surface2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}
          />
          <Pressable
            onPress={onSend}
            disabled={!input.trim() || chat.isPending}
            style={{ width: 42, height: 42, borderRadius: 999, backgroundColor: input.trim() && !chat.isPending ? t.accent : t.surface2, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="trend" size={20} stroke={2.6} color={input.trim() && !chat.isPending ? '#fff' : t.text3} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SuggestMealSheet visible={suggest != null} slot={suggest ?? slotForNow()} date={todayStr()} onClose={() => setSuggest(null)} />
    </View>
  );
}

function ActionConfirm({ label, cta, busy, onConfirm, onCancel }: { label: string; cta: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.hairline, padding: 12 }, t.shadowSm]}>
      <T w={800} size={14} numberOfLines={2} style={{ marginBottom: 10 }}>
        {label}
      </T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button variant="success" icon="check" size="sm" full onPress={busy ? () => {} : onConfirm}>
            {busy ? 'Working…' : cta}
          </Button>
        </View>
        <Pressable onPress={onCancel} hitSlop={8} style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.hairline }}>
          <T w={800} size={13} color={t.text2}>
            Not now
          </T>
        </Pressable>
      </View>
    </View>
  );
}

function Bubble({ role, text, thinking }: { role: 'user' | 'assistant'; text: string; thinking?: boolean }) {
  const t = useTheme();
  const mine = role === 'user';
  return (
    <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '82%',
          backgroundColor: mine ? t.accent : t.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: t.hairline,
          borderRadius: 18,
          borderBottomRightRadius: mine ? 4 : 18,
          borderBottomLeftRadius: mine ? 18 : 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <T w={600} size={15} color={mine ? '#fff' : t.text} style={{ lineHeight: 21, fontStyle: thinking ? 'italic' : 'normal' }}>
          {thinking ? 'Marmalade is thinking…' : text}
        </T>
      </View>
    </View>
  );
}
