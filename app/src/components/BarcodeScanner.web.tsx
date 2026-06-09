// BarcodeScanner.web.tsx — live barcode scanning in the browser via ZXing + getUserMedia.
// Works in iOS Safari, but ONLY over HTTPS (a browser rule). Renders a real <video> element,
// which is fine inside the react-native-web build.

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useTheme } from '../theme';
import { T } from './primitives';

export function BarcodeScanner({ onScan }: { onScan: (code: string) => void }) {
  const t = useTheme();
  const videoRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const g: any = globalThis as any;
    if (typeof g.window !== 'undefined' && g.window.isSecureContext === false) {
      setError('Camera needs a secure (https://) connection to scan.');
      return;
    }
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result: any) => {
            if (!result || cancelled) return;
            const code = result.getText();
            const now = Date.now();
            if (code !== last.current.code || now - last.current.at > 2500) {
              last.current = { code, at: now };
              onScan(code);
            }
          },
        );
        controlsRef.current = controls;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        setError(msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied') ? 'Camera permission was denied.' : 'Could not start the camera.');
      }
    })();
    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, [onScan]);

  if (error) {
    return (
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: t.surface2 }}>
        <T w={700} size={15} color={t.text2}>
          {error}
        </T>
      </View>
    );
  }

  return (
    <View style={{ height: 280, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' }}>
      {React.createElement('video', {
        ref: videoRef,
        autoPlay: true,
        muted: true,
        playsInline: true,
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      } as any)}
    </View>
  );
}
