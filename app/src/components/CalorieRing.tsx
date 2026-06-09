// CalorieRing.tsx — the hero. Ported from components.jsx; the arc animates as calories are logged.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Font, tnum, useTheme } from '../theme';
import { T } from './primitives';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CalorieRing({
  consumed,
  goal,
  size = 230,
  stroke = 20,
  label = 'remaining',
}: {
  consumed: number;
  goal: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
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
