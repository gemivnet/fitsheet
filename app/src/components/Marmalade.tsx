// Marmalade.tsx — the app's companion: a pixel-art orange cat, with a nod to Clippy. She lives in
// the corner on every screen. When the AI notices something (an anomaly) or there's a fresh
// check-in note, she pops a speech bubble in her voice and offers to take you to the right place.
// Tap her any time and she'll say hello even when there's no news. She's the persona of the app.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Svg, { Rect } from 'react-native-svg';
import { Icon } from './Icon';
import { T } from './primitives';
import { api } from '../lib/api';
import { MARMALADE_IDLE, pick } from '../lib/encouragement';
import { todayStr } from '../lib/date';
import { navigate } from '../navigation/ref';
import { useTheme } from '../theme';

export interface CompanionMessage {
  id: string;
  title: string;
  message: string;
  severity: 'fyi' | 'heads_up';
  action: 'none' | 'open_day' | 'open_weight' | 'open_analytics';
}

// ── the cat, as a pixel grid (16×18 sitting orange tabby) ─────────────────────
const C: Record<string, string> = {
  k: '#5A3420', // dark-brown outline
  o: '#E07B2E', // orange coat
  d: '#B5611F', // darker shading
  y: '#F4D88C', // cream (inner ear, muzzle, chest blaze, paws)
  s: 'rgba(60,45,30,0.15)', // ground shadow
};
const PIX = [
  '.....k......k.....',
  '....kok....kok....',
  '....kyok..koyk....',
  '....kyookkooyk....',
  '....kooooooook....',
  '....kooooooook....',
  '.kk.kokooookok.kk.',
  '..k.kooyyyyook.k..',
  '....koyyyyyyok....',
  '.....kookkook.....',
  '....koooyyoook....',
  '....kooyyyyook....',
  '....kdooyyoodk....',
  '....kdoooooodk....',
  '....kyooyyooyk....',
  '....kyyoyyoyyk....',
  '....kyykyykyyk....',
  '....kkkkkkkkkk....',
  '...ssssssssssss...',
];

export function CatSprite({ size }: { size: number }) {
  const cols = 18;
  const px = size / cols;
  const cells: React.ReactNode[] = [];
  PIX.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = C[row[x]];
      if (fill) cells.push(<Rect key={`${x}-${y}`} x={x * px} y={y * px} width={px + 0.6} height={px + 0.6} fill={fill} />);
    }
  });
  return (
    <Svg width={size} height={(size / cols) * PIX.length}>
      {cells}
    </Svg>
  );
}

// Build her prioritized queue from the AI surfaces: heads-up anomalies, then fyi, then the note.
function useCompanionMessages(): CompanionMessage[] {
  const today = todayStr();
  const anomalies = useQuery({ queryKey: ['anomalies', today], queryFn: () => api.ai.anomalies(today), staleTime: 60 * 60 * 1000 });
  const checkin = useQuery({ queryKey: ['checkin'], queryFn: api.ai.checkin, staleTime: 60 * 60 * 1000 });

  const msgs: CompanionMessage[] = [];
  for (const [i, a] of (anomalies.data?.anomalies ?? []).entries()) {
    msgs.push({ id: `anom:${today}:${i}:${a.title}`, title: a.title, message: a.message, severity: a.severity, action: a.action });
  }
  msgs.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'heads_up' ? -1 : 1));
  if (checkin.data?.note) {
    msgs.push({ id: `checkin:${checkin.data.note.slice(0, 24)}`, title: 'A little note', message: checkin.data.note, severity: 'fyi', action: 'open_analytics' });
  }
  return msgs;
}

const act = (action: CompanionMessage['action']) => {
  if (action === 'open_day') navigate('Food', { screen: 'FoodDay' });
  else if (action === 'open_weight') navigate('Weight', { screen: 'Weight' });
  else if (action === 'open_analytics') navigate('More', { screen: 'Analytics' });
};

export function Companion() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const messages = useCompanionMessages();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(true);
  const [idleLine, setIdleLine] = useState<string | null>(null);

  const pending = messages.filter((m) => !dismissed.has(m.id));
  const current = pending[0] ?? null;
  const hasNews = !!current;

  const bob = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 360, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [enter]);
  useEffect(() => {
    if (!hasNews) {
      bob.stopAnimation();
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasNews, bob]);

  // a fresh news item should pop open the bubble
  useEffect(() => {
    if (current) {
      setOpen(true);
      setIdleLine(null);
    }
  }, [current?.id]);

  const dismiss = () => current && setDismissed((s) => new Set(s).add(current.id));
  const onTapCat = () => {
    if (hasNews) setOpen((o) => !o);
    else setIdleLine((l) => (l ? null : pick(MARMALADE_IDLE)));
  };

  // what the bubble shows: a real message, or a tapped idle line
  const bubble = current
    ? { title: current.title, message: current.message, heads: current.severity === 'heads_up', action: current.action }
    : idleLine
      ? { title: 'Marmalade', message: idleLine, heads: false, action: 'none' as const }
      : null;

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, bottom: insets.bottom + 64, alignItems: 'flex-start' }}>
      {bubble && (open || !current) ? (
        <View style={[{ maxWidth: 264, backgroundColor: t.surface, borderRadius: 18, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: t.hairline }, t.shadowSm]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <T w={800} size={13} color={bubble.heads ? t.caution : t.accentPress}>
              {bubble.title}
            </T>
          </View>
          <T w={600} size={14} color={t.text2} style={{ lineHeight: 20 }}>
            {bubble.message}
          </T>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {current && current.action !== 'none' ? (
              <Pressable
                onPress={() => {
                  act(current.action);
                  dismiss();
                }}
                style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.accent }}
              >
                <T w={800} size={13} color="#fff">
                  Show me
                </T>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => navigate('More', { screen: 'MarmaladeChat' })}
              style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.accentSoft }}
            >
              <T w={800} size={13} color={t.accentPress}>
                Chat
              </T>
            </Pressable>
            <Pressable
              onPress={() => (current ? dismiss() : setIdleLine(null))}
              style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.hairline }}
            >
              <T w={800} size={13} color={t.text2}>
                {current && pending.length > 1 ? 'Next' : 'Got it'}
              </T>
            </Pressable>
          </View>
        </View>
      ) : null}
      <Animated.View style={{ transform: [{ translateY }], opacity: enter, marginLeft: 4 }}>
        <Pressable onPress={onTapCat} hitSlop={8} accessibilityLabel="Marmalade the cat">
          <CatSprite size={58} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
