// forms.tsx — small form primitives (TextField, bottom Sheet) used by the data-entry screens.

import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { Font, useTheme } from '../theme';
import { T } from './primitives';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  suffix,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  suffix?: string;
  autoFocus?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <T w={800} size={12} color={t.text3} style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          {label}
        </T>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.hairline, borderRadius: 13, paddingHorizontal: 14 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.text3}
          keyboardType={keyboardType}
          multiline={multiline}
          autoFocus={autoFocus}
          style={{ flex: 1, fontFamily: Font[700], fontSize: 16, color: t.text, paddingVertical: 12, minHeight: multiline ? 90 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
        />
        {suffix ? (
          <T w={700} size={13} color={t.text3}>
            {suffix}
          </T>
        ) : null}
      </View>
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(30,20,16,0.45)' }} onPress={onClose} />
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 34, maxHeight: '88%' }}>
          <View style={{ alignItems: 'center', marginBottom: 10 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.hairline }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <T w={800} size={22}>
              {title}
            </T>
            <Pressable onPress={onClose} hitSlop={10}>
              <T w={800} size={16} color={t.accentPress}>
                Close
              </T>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
