// Toast.tsx — one app-wide toast. Mount <ToastHost/> once at the root; call showToast() anywhere.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { T } from './primitives';
import { useTheme } from '../theme';

export interface ToastOptions {
  kind?: 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

type ToastData = ToastOptions & { id: number; text: string };

let emit: ((t: ToastData) => void) | null = null;
let seq = 0;

export function showToast(text: string, opts: ToastOptions = {}): void {
  emit?.({ id: ++seq, text, ...opts });
}

export function ToastHost() {
  const t = useTheme();
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    emit = (next) => {
      setToast(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), next.duration ?? (next.actionLabel ? 4000 : 2400));
      v.setValue(0);
      Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
    };
    return () => {
      emit = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [v]);

  if (!toast) return null;
  const error = toast.kind === 'error';
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' }}>
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingLeft: 16,
          paddingRight: toast.actionLabel ? 8 : 18,
          marginHorizontal: 16,
          borderRadius: 999,
          backgroundColor: t.text,
          opacity: v,
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 999, backgroundColor: error ? t.caution : t.success, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={error ? 'flame' : 'check'} size={14} stroke={3} color="#fff" />
        </View>
        <T w={800} size={15} color={t.bg} numberOfLines={2} style={{ flexShrink: 1 }}>
          {toast.text}
        </T>
        {toast.actionLabel ? (
          <Pressable
            onPress={() => {
              toast.onAction?.();
              setToast(null);
            }}
            hitSlop={8}
            style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' }}
          >
            <T w={800} size={14} color="#fff">
              {toast.actionLabel}
            </T>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
