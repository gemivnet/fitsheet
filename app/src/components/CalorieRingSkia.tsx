// CalorieRingSkia.tsx — the hero ring drawn with Skia: a gradient arc with a soft glow that
// springs to its value, and a gentle pulse when you're near or over goal. Lazily loaded only after
// CanvasKit is ready (see CalorieRing.tsx); the SVG ring is the fallback so nothing breaks if WASM
// never loads. Default export so it can be code-split.

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurMask, Canvas, Path, Skia, SweepGradient, vec } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { Font, tnum, useTheme } from '../theme';
import { T } from './primitives';

export interface RingProps {
  consumed: number;
  goal: number;
  size?: number;
  stroke?: number;
  label?: string;
}

export default function CalorieRingSkia({ consumed, goal, size = 230, stroke = 20, label = 'remaining' }: RingProps) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1.18, consumed / goal));
  const over = consumed > goal;
  const near = pct >= 0.9;
  const remaining = goal - consumed;
  const ringColor = over ? t.caution : t.accent;
  const cx = size / 2;
  const r = (size - stroke) / 2;

  // a full circle starting at 12 o'clock; the trim end (0..1) is animated to show progress
  const path = React.useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cx, r);
    return p;
  }, [cx, r]);

  const progress = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(Math.min(1, pct), { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [pct, progress]);
  useEffect(() => {
    if (near) {
      pulse.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1, true);
    } else {
      pulse.value = withTiming(0, { duration: 300 });
    }
  }, [near, pulse]);

  const end = useDerivedValue(() => progress.value);
  const blur = useDerivedValue(() => 6 + pulse.value * 8);
  const trackColor = t.accentSofter;

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        {/* track */}
        <Path path={path} style="stroke" strokeWidth={stroke} color={trackColor} start={0} end={1} />
        {/* progress arc with a sweep gradient + glow, rotated so it starts at the top */}
        <Path path={path} style="stroke" strokeWidth={stroke} strokeCap="round" start={0} end={end} color={ringColor} origin={vec(cx, cx)} transform={[{ rotate: -Math.PI / 2 }]}>
          <SweepGradient c={vec(cx, cx)} colors={over ? [t.caution, t.caution] : [t.accent, t.accentPress, t.accent]} />
          <BlurMask blur={blur} style="solid" />
        </Path>
      </Canvas>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <T num w={800} size={size * 0.27} color={over ? t.caution : t.text} style={{ lineHeight: size * 0.3, fontFamily: Font[800] }}>
          {Math.abs(remaining)}
        </T>
        <T w={800} size={14} color={t.text2} style={[{ marginTop: 4 }, tnum]}>
          {over ? 'over goal' : label}
        </T>
      </View>
    </View>
  );
}
