// CalorieRing.tsx — the hero. On web we draw it with Skia (gradient + glow, springy) once CanvasKit
// has loaded; until then — and on any failure, or on native — we fall back to this SVG ring. The
// fallback is the safety net: if the WASM never loads, the app still shows a perfectly good ring.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { Font, tnum, useTheme } from '../theme';
import { T } from './primitives';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface CalorieRingProps {
  consumed: number;
  goal: number;
  size?: number;
  stroke?: number;
  label?: string;
}

// The original SVG ring — kept as the fallback (and the only renderer on native).
export function CalorieRingSvg({ consumed, goal, size = 230, stroke = 20, label = 'remaining' }: CalorieRingProps) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1.18, consumed / goal));
  const over = consumed > goal;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const remaining = goal - consumed;
  const ringColor = over ? t.caution : t.accent;

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.min(1, pct),
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, anim]);
  const dashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [C, 0] });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.accentSofter} strokeWidth={stroke} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${C} ${C}`}
          strokeDashoffset={dashoffset}
        />
      </Svg>
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

// If the Skia chunk or CanvasKit fails to load for any reason, quietly show the SVG ring instead.
class SkiaBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CalorieRing(props: CalorieRingProps) {
  const fallback = <CalorieRingSvg {...props} />;
  if (Platform.OS !== 'web') return fallback;
  return (
    <SkiaBoundary fallback={fallback}>
      <WithSkiaWeb
        getComponent={() => import('./CalorieRingSkia')}
        fallback={fallback}
        componentProps={props}
        opts={{ locateFile: (file: string) => `/${file}` }}
      />
    </SkiaBoundary>
  );
}
