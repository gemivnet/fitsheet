// BarcodeScanner.tsx — native scanner via expo-camera (used when this is built as a native app;
// the .web.tsx variant is used in the browser build).

import React, { useRef } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../theme';
import { Button, T } from './primitives';

export function BarcodeScanner({ onScan }: { onScan: (code: string) => void }) {
  const t = useTheme();
  const [perm, requestPerm] = useCameraPermissions();
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const handle = ({ data }: { data: string }) => {
    const now = Date.now();
    if (data !== last.current.code || now - last.current.at > 2500) {
      last.current = { code: data, at: now };
      onScan(data);
    }
  };

  if (!perm) return <T w={700} color={t.text3}>Checking camera…</T>;
  if (!perm.granted) {
    return (
      <View>
        <T w={700} size={15} style={{ marginBottom: 12 }}>
          Allow camera access to scan barcodes.
        </T>
        <Button icon="camera" onPress={requestPerm}>
          Enable camera
        </Button>
      </View>
    );
  }
  return (
    <View style={{ height: 280, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={handle} />
    </View>
  );
}
