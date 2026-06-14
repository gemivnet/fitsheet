// OfflineBanner.tsx — a thin bar that appears when the device drops offline, so Shelby knows
// the data she's seeing is cached (restored from localStorage) and changes won't save yet.
// Mount <OfflineBanner/> once at the root; driven by react-query's onlineManager.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { T } from './primitives';
import { useTheme } from '../theme';

export function OfflineBanner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(() => onlineManager.isOnline());

  useEffect(() => onlineManager.subscribe(setOnline), []);

  if (online) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top + 6,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: t.text,
      }}
    >
      <Icon name="info" size={14} stroke={3} color={t.bg} />
      <T w={800} size={13} color={t.bg}>
        Offline — showing your last saved data
      </T>
    </View>
  );
}
