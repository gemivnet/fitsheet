// AutocompleteField.tsx — a single-line text field with inline "ghost text" autocomplete. As she
// types, a greyed completion is shown after the caret; Tab / Enter / tapping ⇥ accepts it. Suffixes
// come instantly from a local candidate pool (her foods, a restaurant's menu) and are upgraded by a
// debounced AI completion when one is provided. Web/PWA is the target; alignment relies on the ghost
// using the SAME font as the input so the typed part's width matches exactly.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Font, useTheme } from '../theme';
import { T } from './primitives';

const FZ = 16;

export function AutocompleteField({
  value,
  onChangeText,
  placeholder,
  label,
  autoFocus,
  candidates = [],
  fetchCompletion,
  onSubmit,
  minChars = 2,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  candidates?: string[];
  fetchCompletion?: (text: string) => Promise<string>;
  onSubmit?: () => void;
  minChars?: number;
}) {
  const t = useTheme();
  const [aiSuffix, setAiSuffix] = useState('');
  const cache = useRef<Map<string, string>>(new Map());
  const fetchRef = useRef(fetchCompletion);
  fetchRef.current = fetchCompletion;

  const v = value;
  const lv = v.toLowerCase();
  // instant local prefix completion from her own data (free, no network)
  let localSuffix = '';
  if (v.trim().length >= minChars) {
    for (const c of candidates) {
      if (c.length > v.length && c.toLowerCase().startsWith(lv)) {
        const suf = c.slice(v.length);
        if (!localSuffix || suf.length < localSuffix.length) localSuffix = suf;
      }
    }
  }

  // Debounced AI completion — only when there's NO local match, only after she pauses (500ms), and
  // cached per input, so typing makes at most one call per distinct pause (often zero).
  useEffect(() => {
    setAiSuffix('');
    const fn = fetchRef.current;
    if (!fn || localSuffix || v.trim().length < Math.max(3, minChars)) return;
    const key = v.trim().toLowerCase();
    if (cache.current.has(key)) {
      setAiSuffix(cache.current.get(key) || '');
      return;
    }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const s = (await fn(v)) || ''; // keep leading space — it's the word boundary
        cache.current.set(key, s);
        if (alive) setAiSuffix(s);
      } catch {
        /* autocomplete fails silently */
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [v, localSuffix, minChars]);

  const suffix = aiSuffix || localSuffix;
  const accept = () => {
    if (suffix) {
      onChangeText(value + suffix);
      setAiSuffix('');
    }
  };

  const onKeyPress = (e: any) => {
    const k = e?.nativeEvent?.key;
    if (suffix && (k === 'Tab' || k === 'Enter')) {
      if (k === 'Tab' && typeof e.preventDefault === 'function') e.preventDefault();
      accept();
    }
  };

  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: t.surface,
          borderWidth: 1.5,
          borderColor: suffix ? t.accent : t.hairline,
          borderRadius: 13,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        {/* ghost: typed part transparent (same glyphs → exact width), suffix grey */}
        {suffix ? (
          <T numberOfLines={1} w={700} size={FZ} style={{ position: 'absolute', left: 14, right: 48, top: 12 }}>
            <T w={700} size={FZ} color="transparent">
              {value}
            </T>
            <T w={700} size={FZ} color={t.text3}>
              {suffix}
            </T>
          </T>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onKeyPress={onKeyPress}
          onSubmitEditing={() => (suffix ? accept() : onSubmit?.())}
          placeholder={placeholder}
          placeholderTextColor={t.text3}
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          style={{ flex: 1, padding: 0, fontFamily: Font[700], fontSize: FZ, color: t.text, backgroundColor: 'transparent' }}
        />
        {suffix ? (
          <Pressable onPress={accept} hitSlop={8} style={{ marginLeft: 8, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 8, backgroundColor: t.accentSoft }}>
            <T w={800} size={13} color={t.accentPress}>
              ⇥
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
