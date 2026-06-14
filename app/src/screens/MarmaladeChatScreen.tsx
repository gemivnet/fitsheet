// MarmaladeChatScreen.tsx — talk to Marmalade in the moment. For when a decision is wobbling
// ("McDonald's after Chipotle?") and you want a warm, honest friend to talk it through. She's
// grounded in today's real numbers server-side; the conversation lives for the session.

import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { CatSprite, Icon, T } from '../components';
import { api, type ChatTurn } from '../lib/api';
import { todayStr } from '../lib/date';
import { Font, useTheme } from '../theme';

export function MarmaladeChatScreen() {
  const t = useTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const scroller = useRef<ScrollView>(null);

  const chat = useMutation({
    mutationFn: (history: ChatTurn[]) => api.ai.chat(history, todayStr()),
    onSuccess: (out) => setMessages((m) => [...m, { role: 'assistant', content: out.reply || 'Mrrp?' }]),
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
  }, [messages, chat.isPending]);

  const onSend = () => {
    const text = input.trim();
    if (!text || chat.isPending) return;
    const next: ChatTurn[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    chat.mutate(next);
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
