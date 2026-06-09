// Celebration.tsx — milestone moment. Confetti + KPI + encouraging copy.
// Ported from components.jsx (CelebrationModal/Confetti).

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, View, type DimensionValue } from 'react-native';
import { useTheme } from '../theme';
import { Button, Card, T } from './primitives';

const CONFETTI_COLORS = ['#F8836B', '#FFD9C7', '#6BBF8A', '#E8B04B', '#7CA6C9', '#C07A9E'];

function Piece({ i, height }: { i: number; height: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const delay = (i % 7) * 180;
    const dur = 1600 + (i % 5) * 300;
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: dur, delay, easing: Easing.bezier(0.4, 0.6, 0.6, 1), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [i, v]);
  const left = `${(i * 37) % 100}%` as DimensionValue;
  const size = 7 + (i % 4) * 2;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-16, height] });
  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: [`${i * 47}deg`, `${i * 47 + 540}deg`] });
  const opacity = v.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0.9] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left,
        width: size,
        height: size * 1.4,
        backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        borderRadius: 2,
        opacity,
        transform: [{ translateY }, { rotate }],
      }}
    />
  );
}

export function Confetti({ n = 28, height = 440 }: { n?: number; height?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: 20 }}>
      {Array.from({ length: n }).map((_, i) => (
        <Piece key={i} i={i} height={height} />
      ))}
    </View>
  );
}

export function CelebrationModal({
  visible,
  title,
  body,
  kpi,
  cta = 'Keep it up!',
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  kpi: string | number;
  cta?: string;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: 'rgba(30,20,16,0.4)' }}>
        <Card pad={0} style={[{ width: '100%', maxWidth: 440, overflow: 'hidden' }, t.shadowLg]}>
          <Confetti />
          <View style={{ paddingTop: 40, paddingBottom: 30, paddingHorizontal: 34, alignItems: 'center' }}>
            <View style={{ width: 96, height: 96, marginBottom: 18, borderRadius: 999, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <T num w={800} size={40} color={t.accentPress}>
                {kpi}
              </T>
            </View>
            <T w={800} size={26} style={{ marginBottom: 8, textAlign: 'center' }}>
              {title}
            </T>
            <T w={600} size={16} color={t.text2} style={{ lineHeight: 24, marginBottom: 26, textAlign: 'center' }}>
              {body}
            </T>
            <Button full size="lg" onPress={onClose}>
              {cta}
            </Button>
          </View>
        </Card>
      </View>
    </Modal>
  );
}
