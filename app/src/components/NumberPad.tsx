// NumberPad.tsx — the on-screen numpad used everywhere a number is entered in the add-food flow.
// No system keyboard; the first keypress replaces the pre-filled value ("fresh"), so re-typing an
// amount is instant. Shared so every numeric input behaves identically on iPad + phone.

import React, { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { T } from './primitives';

const KEYS: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

// Pure key handler. `fresh` = the current value is a pre-fill the first keypress should replace.
export function applyNumberKey(cur: string, key: string, fresh: boolean): string {
  if (key === 'back') return fresh || cur.length <= 1 ? '0' : cur.slice(0, -1);
  const base = fresh || cur === '0' ? '' : cur;
  if (key === '.') return base.includes('.') ? base : `${base === '' ? '0' : base}.`;
  const next = base + key;
  return next.length > 7 ? base : next;
}

// Single-value field: owns its own "fresh" flag. `reset(v)` re-arms fresh (next key replaces v).
export function useNumberField(initial = '0') {
  const [value, setValue] = useState(initial);
  const fresh = useRef(true);
  const press = useCallback((key: string) => {
    setValue((cur) => applyNumberKey(cur, key, fresh.current));
    fresh.current = false;
  }, []);
  const reset = useCallback((v: string) => {
    setValue(v);
    fresh.current = true;
  }, []);
  return { value, press, reset };
}

export function NumberPad({ onKey, keyHeight = 56 }: { onKey: (k: string) => void; keyHeight?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          onPress={() => onKey(k)}
          style={({ pressed }) => ({
            width: '31.5%',
            flexGrow: 1,
            height: keyHeight,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? t.accentSoft : t.surface,
            borderWidth: 1.5,
            borderColor: t.hairline,
          })}
        >
          {k === 'back' ? (
            <Icon name="chevL" size={22} stroke={2.4} color={t.text2} />
          ) : (
            <T w={800} size={23}>
              {k}
            </T>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// A tappable value box for calculator-style forms (several fields share one NumberPad).
export function NumberField({
  label,
  value,
  unit,
  active,
  flagged,
  onPress,
}: {
  label?: string;
  value: string;
  unit?: string;
  active: boolean;
  flagged?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ marginBottom: 12 }}>
      {label ? (
        <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: active ? t.accentSoft : t.surface,
          borderRadius: 13,
          paddingHorizontal: 14,
          borderWidth: active || flagged ? 2 : 1.5,
          borderColor: active ? t.accent : flagged ? t.caution : t.hairline,
        }}
      >
        <T num w={800} size={20} color={active ? t.accentPress : t.text} style={{ flex: 1, paddingVertical: 12 }}>
          {value || '0'}
        </T>
        {unit ? (
          <T w={700} size={13} color={t.text3}>
            {unit}
          </T>
        ) : null}
        {flagged ? <Icon name="edit" size={16} color={t.caution} /> : null}
      </View>
    </Pressable>
  );
}
