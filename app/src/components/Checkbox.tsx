// Checkbox.tsx — the rounded tick used for meal-complete + weekly goals. Success fill when checked,
// hairline outline when not. One primitive so every checkbox matches.

import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { Radius, Space, useTheme } from '../theme';

export function Checkbox({ checked, onToggle, size = 24 }: { checked: boolean; onToggle?: () => void; size?: number }) {
  const t = useTheme();
  const box = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: checked ? t.success : 'transparent',
        borderWidth: checked ? 0 : 1.8,
        borderColor: t.hairline,
      }}
    >
      {checked ? <Icon name="check" size={size * 0.62} stroke={3} color="#fff" /> : null}
    </View>
  );
  return onToggle ? (
    <Pressable onPress={onToggle} hitSlop={Space[2]} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      {box}
    </Pressable>
  ) : (
    box
  );
}
