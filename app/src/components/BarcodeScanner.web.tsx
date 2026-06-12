// BarcodeScanner.web.tsx — live barcode scanning in the browser via ZXing + getUserMedia.
// Works in iOS Safari, but ONLY over HTTPS (a browser rule). Renders a real <video> element,
// which is fine inside the react-native-web build.
//
// The camera is started ONLY after an explicit tap. iOS standalone PWAs don't persist camera
// permission, so auto-starting would prompt on every visit — tap-to-start keeps it intentional.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useTheme } from '../theme';
import { Icon } from './Icon';
import { T } from './primitives';

export function BarcodeScanner({ onScan }: { onScan: (code: string) => void }) {
  const t = useTheme();
  const videoRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const [started, setStarted] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!started) return;
    setLive(false);
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
        if (!cancelled) setLive(true);
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        setError(
          msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')
            ? 'Camera permission was denied. To scan again, allow Camera for this app in your phone’s Settings (Settings → Apps → your browser, or Settings → Safari → Camera), then come back. The Find tab works in the meantime.'
            : 'Could not start the camera — the Find tab works in the meantime.',
        );
        setStarted(false);
      }
    })();
    return () => {
      cancelled = true;
      try {
        controlsRef.current?.stop();
      } catch {
        /* noop */
      }
      controlsRef.current = null;
    };
  }, [started, onScan]);

  if (error) {
    return (
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: t.surface2, gap: 12 }}>
        <T w={700} size={15} color={t.text2} style={{ lineHeight: 21 }}>
          {error}
        </T>
        <Pressable
          onPress={() => {
            setError(null);
            setStarted(true);
          }}
          hitSlop={8}
        >
          <T w={800} size={14} color={t.accentPress}>
            Try again
          </T>
        </Pressable>
      </View>
    );
  }

  if (!started) {
    return (
      <Pressable
        onPress={() => setStarted(true)}
        style={{ height: 280, borderRadius: 20, backgroundColor: t.surface2, borderWidth: 1.5, borderColor: t.hairline, alignItems: 'center', justifyContent: 'center', gap: 12 }}
      >
        <View style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="camera" size={30} stroke={2.2} color="#fff" />
        </View>
        <T w={800} size={16} color={t.accentPress}>
          Tap to start camera
        </T>
        <T w={600} size={13} color={t.text3} style={{ textAlign: 'center', maxWidth: 240 }}>
          We only turn the camera on when you’re ready to scan.
        </T>
      </Pressable>
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
      {!live ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <T w={800} size={15} color="#fff">
            Starting camera…
          </T>
        </View>
      ) : null}
    </View>
  );
}
