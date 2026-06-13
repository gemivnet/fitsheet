// Marmalade.tsx — a pixel-art orange cat companion, with a nod to Clippy. She pops up in the
// corner only when she has something to say (an anomaly Marmalade noticed), shows it in a speech
// bubble, and offers to take you to the relevant screen. One message at a time; "Got it" dismisses.
// The message queue is generic, so later she can voice the recap, check-ins, and milestones too.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Icon } from './Icon';
import { T } from './primitives';
import { useTheme } from '../theme';

export interface CompanionMessage {
  id: string;
  title: string;
  message: string;
  severity: 'fyi' | 'heads_up';
  action: 'none' | 'open_day' | 'open_weight' | 'open_analytics';
}

// ── the cat, as a pixel grid ──────────────────────────────────────────────────
// Each char is one pixel: o/d orange + stripe, c cream, e eye, b pupil, n nose, p bow, . clear.
const C: Record<string, string> = {
  o: '#F2933C', // orange coat
  d: '#D9772C', // darker stripe
  c: '#FBE7CE', // cream muzzle / belly / paws
  e: '#F4FBF6', // eye white
  b: '#2E2A26', // pupil / outline
  n: '#E07E8B', // nose
  p: '#E86A86', // little bow (her flower)
};
// 12 × 13 sitting cat, facing forward (every row is exactly 12 chars)
const PIX = [
  '..o......o..',
  '.odo....odo.',
  '.oooppooooo.',
  'ooooooooooo.',
  'ocoooooocoo.',
  'oooddddoooo.',
  'oeboooobeoo.',
  'ooooonnoooo.',
  'ocooppppcoo.',
  '.occcccco...',
  '.ooooooooo..',
  '.occo.occo..',
  '..oooooooo..',
];

function CatSprite({ size }: { size: number }) {
  const cols = 12;
  const px = size / cols;
  const rects: React.ReactNode[] = [];
  PIX.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = C[row[x]];
      if (fill) rects.push(<Rect key={`${x}-${y}`} x={x * px} y={y * px} width={px + 0.5} height={px + 0.5} fill={fill} />);
    }
  });
  return (
    <Svg width={size} height={(size / cols) * PIX.length}>
      {rects}
    </Svg>
  );
}

export function Marmalade({ messages, onAct }: { messages: CompanionMessage[]; onAct: (m: CompanionMessage) => void }) {
  const t = useTheme();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(true);
  const pending = messages.filter((m) => !dismissed.has(m.id));
  const current = pending[0] ?? null;

  // slide + gentle bob when she has something to say
  const v = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: current ? 1 : 0, duration: 320, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();
    if (current) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [current, v, bob]);

  if (!current) return null;
  const dismiss = () => setDismissed((s) => new Set(s).add(current.id));
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const enter = { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 14, bottom: 18, alignItems: 'flex-end' }}>
      <Animated.View style={enter}>
        {open ? (
          <View style={[{ maxWidth: 270, backgroundColor: t.surface, borderRadius: 18, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: t.hairline }, t.shadowSm]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <T w={800} size={13} color={current.severity === 'heads_up' ? t.caution : t.accentPress}>
                {current.title}
              </T>
              <Pressable onPress={dismiss} hitSlop={10} style={{ marginLeft: 'auto' }}>
                <Icon name="more" size={16} color={t.text3} />
              </Pressable>
            </View>
            <T w={600} size={14} color={t.text2} style={{ lineHeight: 20 }}>
              {current.message}
            </T>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {current.action !== 'none' ? (
                <Pressable
                  onPress={() => {
                    onAct(current);
                    dismiss();
                  }}
                  style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.accent }}
                >
                  <T w={800} size={13} color="#fff">
                    Show me
                  </T>
                </Pressable>
              ) : null}
              <Pressable onPress={dismiss} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.hairline }}>
                <T w={800} size={13} color={t.text2}>
                  {pending.length > 1 ? 'Next' : 'Got it'}
                </T>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Animated.View>
      <Animated.View style={{ transform: [{ translateY }], opacity: v }}>
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={8} accessibilityLabel="Marmalade the cat">
          <CatSprite size={62} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
