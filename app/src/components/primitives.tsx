// primitives.tsx — fitsheet shared UI, ported from the handoff (components.jsx).
// Calorie-first, warm & encouraging. Colors come from useTheme(); fonts are Nunito by weight.

import React from 'react';
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Font, tnum, useTheme, type FontWeight, type Theme } from '../theme';
import { Icon, type IconName } from './Icon';

type Macro = 'pro' | 'carb' | 'fat';
const macroColor = (t: Theme, v: Macro) => ({ pro: t.pro, carb: t.carb, fat: t.fat })[v];
const macroSoft = (t: Theme, v: Macro) => ({ pro: t.proSoft, carb: t.carbSoft, fat: t.fatSoft })[v];

// ── Themed text — Nunito by weight, optional tabular numerals ───────────────
export function T({
  w = 600,
  size = 16,
  color,
  num,
  style,
  children,
  numberOfLines,
}: {
  w?: FontWeight;
  size?: number;
  color?: string;
  num?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: Font[w], fontSize: size, color: color ?? t.text }, num ? tnum : null, style]}
    >
      {children}
    </Text>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
  pad = 22,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pad?: number;
  onPress?: () => void;
}) {
  const t = useTheme();
  const body = (
    <View style={[{ backgroundColor: t.surface, borderRadius: 20, padding: pad }, t.shadow, style]}>{children}</View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.9 } : null)}>
      {body}
    </Pressable>
  );
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Text style={[{ fontFamily: Font[800], fontSize: 13, letterSpacing: 0.7, textTransform: 'uppercase', color: t.text3 }, style]}>
      {children}
    </Text>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'soft' | 'success' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  children,
  variant = 'primary',
  icon,
  size = 'md',
  full,
  style,
  onPress,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: ButtonSize;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const t = useTheme();
  const padV = size === 'lg' ? 18 : size === 'sm' ? 9 : 14;
  const padH = size === 'lg' ? 24 : size === 'sm' ? 14 : 20;
  const fz = size === 'lg' ? 19 : size === 'sm' ? 14 : 17;
  const variants: Record<ButtonVariant, { bg: string; fg: string; ring?: string; shadow?: Theme['shadow'] }> = {
    primary: {
      bg: t.accent,
      fg: '#fff',
      shadow: { shadowColor: t.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 5 },
    },
    soft: { bg: t.accentSoft, fg: t.accentPress },
    success: { bg: t.success, fg: '#fff' },
    ghost: { bg: 'transparent', fg: t.text2, ring: t.hairline },
  };
  const v = variants[variant];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          paddingVertical: padV,
          paddingHorizontal: padH,
          borderRadius: 999,
          backgroundColor: v.bg,
          alignSelf: full ? 'stretch' : 'flex-start',
          width: full ? '100%' : undefined,
          borderWidth: v.ring ? 1.5 : 0,
          borderColor: v.ring,
        },
        v.shadow,
        pressed ? { transform: [{ scale: 0.98 }], opacity: 0.92 } : null,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 18} stroke={2.4} color={v.fg} /> : null}
      <Text style={{ fontFamily: Font[800], fontSize: fz, color: v.fg }}>{children}</Text>
    </Pressable>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────
export function Chip({
  children,
  color,
  soft,
  active,
  icon,
  onPress,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  soft?: string;
  active?: boolean;
  icon?: IconName;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const fg = active ? '#fff' : color ?? t.text2;
  const Body = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 7,
          paddingHorizontal: 13,
          borderRadius: 999,
          backgroundColor: active ? t.accent : soft ?? t.surface2,
          borderWidth: active ? 0 : 1,
          borderColor: t.hairline,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={15} stroke={2.4} color={fg} /> : null}
      <Text style={{ fontFamily: Font[700], fontSize: 14, color: fg }}>{children}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{Body}</Pressable> : Body;
}

// ── Segmented control ───────────────────────────────────────────────────────
export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange?: (o: string) => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 4,
        padding: 4,
        backgroundColor: t.surface2,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: t.hairline,
      }}
    >
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange?.(o)}
            style={[
              { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 11, alignItems: 'center', backgroundColor: on ? t.surface : 'transparent' },
              on ? t.shadowSm : null,
            ]}
          >
            <Text style={{ fontFamily: Font[800], fontSize: 15, color: on ? t.text : t.text3 }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Progress bar ────────────────────────────────────────────────────────────
export function ProgressBar({
  value,
  max,
  tone = 'accent',
  height = 12,
  showOver,
}: {
  value: number;
  max: number;
  tone?: 'accent' | 'success' | 'caution';
  height?: number;
  showOver?: boolean;
}) {
  const t = useTheme();
  const pct = Math.min(1, value / max);
  const over = value > max;
  const colors = { accent: t.accent, success: t.success, caution: t.caution };
  const fill = over && showOver ? t.caution : colors[tone];
  return (
    <View style={{ height, borderRadius: height, backgroundColor: t.surface2, overflow: 'hidden', borderWidth: 1, borderColor: t.hairline }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height, backgroundColor: fill }} />
    </View>
  );
}

// ── Macro mini-bar + chip ───────────────────────────────────────────────────
export function MacroBar({ label, value, goal, varName }: { label: string; value: number; goal: number; varName: Macro }) {
  const t = useTheme();
  const c = macroColor(t, varName);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <Text style={{ fontFamily: Font[800], fontSize: 13, color: c }}>{label}</Text>
        <Text style={[{ fontFamily: Font[700], fontSize: 13, color: t.text3 }, tnum]}>
          {value}
          <Text style={{ fontSize: 11 }}>g</Text>
        </Text>
      </View>
      <View style={{ height: 7, borderRadius: 7, backgroundColor: macroSoft(t, varName), overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, (value / goal) * 100)}%`, height: '100%', borderRadius: 7, backgroundColor: c }} />
      </View>
    </View>
  );
}

export function MacroChip({ label, grams, varName }: { label: string; grams: number; varName: Macro }) {
  const t = useTheme();
  const c = macroColor(t, varName);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 3,
        paddingLeft: 7,
        paddingRight: 9,
        borderRadius: 999,
        backgroundColor: macroSoft(t, varName),
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
      <Text style={{ fontFamily: Font[800], fontSize: 12, color: c }}>
        {label} <Text style={tnum}>{grams}g</Text>
      </Text>
    </View>
  );
}

// ── Food row ────────────────────────────────────────────────────────────────
export interface FoodRowData {
  name: string;
  grams: number;
  kcal: number;
  macros: { label: string; grams: number; varName: Macro }[];
}
export function FoodRow({ name, grams, kcal, macros, last }: FoodRowData & { last?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.hairline,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={700} size={16} numberOfLines={1} style={{ marginBottom: 4 }}>
          {name}
        </T>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {macros.map((m) => (
            <MacroChip key={m.label} label={m.label[0]} grams={m.grams} varName={m.varName} />
          ))}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T w={800} size={17} num>
          {kcal}
        </T>
        <T w={700} size={12} num color={t.text3}>
          {grams} g
        </T>
      </View>
    </View>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
export function EmptyState({
  icon = 'flame',
  title,
  body,
  cta,
  onPressCta,
}: {
  icon?: IconName;
  title: string;
  body: string;
  cta?: string;
  onPressCta?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 34, paddingHorizontal: 24 }}>
      <View style={{ width: 72, height: 72, marginBottom: 16, borderRadius: 999, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={32} stroke={2} color={t.text3} />
      </View>
      <T w={800} size={18} style={{ marginBottom: 6 }}>
        {title}
      </T>
      <T w={600} size={15} color={t.text2} style={{ textAlign: 'center', maxWidth: 280, lineHeight: 22 }}>
        {body}
      </T>
      {cta ? (
        <View style={{ marginTop: 18 }}>
          <Button variant="soft" icon="plus" onPress={onPressCta}>
            {cta}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

// ── Round icon button (date nav etc.) ───────────────────────────────────────
export function RoundBtn({ icon, onPress }: { icon: IconName; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[{ width: 46, height: 46, borderRadius: 999, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }, t.shadowSm]}
    >
      <Icon name={icon} size={22} stroke={2.4} color={t.text2} />
    </Pressable>
  );
}
