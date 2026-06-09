// Screen.tsx — shared screen chrome. Warm bg + a scroll area whose content caps at 600 and
// centers, so it fills a phone and sits centered on the iPad mini (the handoff's IPadFrame rule).

import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export function Screen({
  children,
  padH = 28,
  padTop = 6,
  padBottom = 40,
}: {
  children: React.ReactNode;
  padH?: number;
  padTop?: number;
  padBottom?: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: padTop + insets.top, paddingBottom: padBottom, alignItems: 'center' }}
      >
        <View style={{ width: '100%', maxWidth: 600, paddingHorizontal: padH }}>{children}</View>
      </ScrollView>
    </View>
  );
}
