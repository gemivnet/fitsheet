// Toast.tsx — one app-wide toast. Mount <ToastHost/> once at the root; call showToast() anywhere.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AnimatePresence, MotiView } from 'moti';
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

  useEffect(() => {
    emit = (next) => {
      setToast(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), next.duration ?? (next.actionLabel ? 4000 : 2400));
    };
    return () => {
      emit = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const error = toast?.kind === 'error';
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' }}>
      <AnimatePresence>
        {toast ? (
          <MotiView
            key={toast.id}
            from={{ opacity: 0, scale: 0.85, translateY: 12 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            exit={{ opacity: 0, scale: 0.9, translateY: 8 }}
            transition={{ type: 'spring', damping: 16, stiffness: 220, mass: 0.7 }}
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
          </MotiView>
        ) : null}
      </AnimatePresence>
    </View>
  );
}
