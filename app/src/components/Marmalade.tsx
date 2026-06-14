// Marmalade.tsx — the app's companion: a pixel-art orange cat, with a nod to Clippy. She lives in
// the corner on every screen. When the AI notices something (an anomaly) or there's a fresh
// check-in note, she pops a speech bubble in her voice and offers to take you to the right place.
// Tap her any time and she'll say hello even when there's no news. She's the persona of the app.

import React, { useEffect, useState } from 'react';
import { Dimensions, Easing, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Svg, { Rect } from 'react-native-svg';
import { Icon } from './Icon';
import { T } from './primitives';
import { api } from '../lib/api';
import { MARMALADE_IDLE, pick } from '../lib/encouragement';
import { todayStr } from '../lib/date';
import { navigate, navigationRef } from '../navigation/ref';
import { useTheme } from '../theme';

// Where Shelby last parked her, as an offset from the home corner (bottom-left). Persisted so she
// stays put across reloads. Web-only storage; native just starts in the corner.
const POS_KEY = 'marmalade-pos';
function loadPos(): { x: number; y: number } | null {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage?.getItem(POS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function savePos(x: number, y: number): void {
  try {
    window.localStorage?.setItem(POS_KEY, JSON.stringify({ x, y }));
  } catch {
    /* ignore */
  }
}

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

  // track the active route so she can step aside on the chat screen (she'd cover the input there)
  const [route, setRoute] = useState<string | undefined>(undefined);
  useEffect(() => {
    const sync = () => setRoute(navigationRef.getCurrentRoute()?.name);
    sync();
    const unsub = navigationRef.addListener('state', sync);
    return unsub;
  }, []);

  const pending = messages.filter((m) => !dismissed.has(m.id));
  const current = pending[0] ?? null;
  const hasNews = !!current;

  // a fresh news item should pop open the bubble
  useEffect(() => {
    if (current) {
      setOpen(true);
      setIdleLine(null);
    }
  }, [current?.id]);

  // idle life — when she has nothing to say she naps, plays with a yarn ball, or just sits
  const [activity, setActivity] = useState<'sit' | 'sleep' | 'play'>('sit');
  useEffect(() => {
    if (hasNews || idleLine) {
      setActivity('sit');
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const rest = () => {
      timer = setTimeout(
        () => {
          if (!live) return;
          const roll = Math.random();
          const next = roll < 0.4 ? 'sleep' : roll < 0.7 ? 'play' : 'sit';
          setActivity(next);
          timer = setTimeout(() => {
            if (!live) return;
            setActivity('sit');
            rest();
          }, next === 'sleep' ? 9000 : next === 'play' ? 4500 : 5000);
        },
        9000 + Math.random() * 9000,
      );
    };
    rest();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [hasNews, idleLine]);

  const dismiss = () => current && setDismissed((s) => new Set(s).add(current.id));
  const onTapCat = () => {
    if (hasNews) setOpen((o) => !o);
    else setIdleLine((l) => (l ? null : pick(MARMALADE_IDLE)));
  };
  // keep the latest tap handler reachable from the gesture (which is built once)
  const tapRef = React.useRef(onTapCat);
  tapRef.current = onTapCat;
  const fireTap = () => tapRef.current();

  // ── drag her anywhere, and remember where she's parked ──────────────────────
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  useEffect(() => {
    const p = loadPos();
    if (p) {
      tx.value = p.x;
      ty.value = p.y;
    }
  }, [tx, ty]);
  const win = Dimensions.get('window');
  const maxRight = Math.max(0, win.width - 64 - 28); // 64 = her box, 14px home margin each side
  const minUp = -Math.max(0, win.height - insets.top - 140);
  const pan = Gesture.Pan()
    .minDistance(8)
    .onChange((e) => {
      'worklet';
      tx.value = Math.min(maxRight, Math.max(-8, tx.value + e.changeX));
      ty.value = Math.min(40, Math.max(minUp, ty.value + e.changeY));
    })
    .onEnd(() => {
      'worklet';
      runOnJS(savePos)(tx.value, ty.value);
    });
  const tap = Gesture.Tap().onEnd(() => {
    'worklet';
    runOnJS(fireTap)();
  });
  const gesture = Gesture.Exclusive(pan, tap);
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }] }));

  // what the bubble shows: a real message, or a tapped idle line
  const bubble = current
    ? { title: current.title, message: current.message, heads: current.severity === 'heads_up', action: current.action }
    : idleLine
      ? { title: 'Marmalade', message: idleLine, heads: false, action: 'none' as const }
      : null;

  // step aside on her own chat screen — you're already talking to her there
  if (route === 'MarmaladeChat') return null;

  const openChat = () => {
    setDismissed((s) => new Set([...s, ...pending.map((m) => m.id)])); // engaging directly clears the queue
    navigate('More', { screen: 'MarmaladeChat' });
  };
  return (
    <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 14, bottom: insets.bottom + 64, alignItems: 'flex-start' }, dragStyle]}>
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
            <Pressable onPress={openChat} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.accentSoft }}>
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
      <MotiView
        from={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 180 }}
        style={{ marginLeft: 4 }}
      >
        <View style={{ width: 64 }}>
          {/* napping — drifting Zzz */}
          {activity === 'sleep' ? (
            <MotiView
              from={{ opacity: 0.35 }}
              animate={{ opacity: 1 }}
              transition={{ type: 'timing', duration: 1800, loop: true, repeatReverse: true, easing: Easing.inOut(Easing.quad) }}
              style={{ position: 'absolute', top: -8, right: 0 }}
            >
              <T w={800} size={13} color={t.text3}>
                z z z
              </T>
            </MotiView>
          ) : null}
          {/* playing — a yarn ball bouncing beside her */}
          {activity === 'play' ? (
            <MotiView
              from={{ translateY: 0 }}
              animate={{ translateY: -18 }}
              transition={{ type: 'timing', duration: 320, loop: true, repeatReverse: true, easing: Easing.inOut(Easing.quad) }}
              style={{ position: 'absolute', right: -8, bottom: 8 }}
            >
              <View style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: t.accent, borderWidth: 1.5, borderColor: t.accentPress }} />
            </MotiView>
          ) : null}
          <GestureDetector gesture={gesture}>
            <MotiView
              animate={{ translateY: hasNews ? -5 : 0, scale: activity === 'sleep' ? 1.04 : 1 }}
              transition={{
                translateY: hasNews
                  ? { type: 'timing', duration: 850, loop: true, repeatReverse: true, easing: Easing.inOut(Easing.quad) }
                  : { type: 'spring', damping: 14 },
                scale: activity === 'sleep' ? { type: 'timing', duration: 1800, loop: true, repeatReverse: true, easing: Easing.inOut(Easing.quad) } : { type: 'spring', damping: 14 },
              }}
              accessibilityLabel="Marmalade the cat"
            >
              <CatSprite size={58} />
            </MotiView>
          </GestureDetector>
        </View>
      </MotiView>
    </Animated.View>
  );
}
