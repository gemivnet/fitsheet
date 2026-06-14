// ScreenHeader.tsx — the back-chevron + title row shared by every inner screen (Settings,
// Analytics, Notes, Recipes, Goals, Meal plan, chat…). One place so headers can't drift apart.
// Optional `right` slot for a trailing action.

import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { T } from './primitives';
import { FontSize, Space, useTheme } from '../theme';

export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space[2.5], marginTop: Space[2.5], marginBottom: Space[4] }}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={Space[2.5]} accessibilityLabel="Back">
          <Icon name="chevL" size={26} color={t.text2} />
        </Pressable>
      ) : null}
      <T w={800} size={FontSize.h1} numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </T>
      {right ? <View style={{ marginLeft: 'auto' }}>{right}</View> : null}
    </View>
  );
}
