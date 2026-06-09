// theme.ts — fitsheet design tokens, ported from the Claude Design handoff (theme.jsx).
// "Warm & encouraging": soft coral/peach, warm neutrals, rounded cards, friendly numerals (Nunito).
// Two token tables (light/dark) exposed through <ThemeProvider> + useTheme().

import React, { createContext, useContext } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';

export type ThemeMode = 'light' | 'dark';

export interface Shadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface Theme {
  mode: ThemeMode;
  // surfaces
  accent: string;
  accentPress: string;
  accentSoft: string;
  accentSofter: string;
  bg: string;
  surface: string;
  surface2: string;
  hairline: string;
  // semantics
  success: string;
  successSoft: string;
  caution: string;
  cautionSoft: string;
  // text
  text: string;
  text2: string;
  text3: string;
  // macros
  pro: string;
  carb: string;
  fat: string;
  proSoft: string;
  carbSoft: string;
  fatSoft: string;
  // chart
  chartGrid: string;
  chartRaw: string;
  chartTrend: string;
  // elevation
  shadowSm: Shadow;
  shadow: Shadow;
  shadowLg: Shadow;
}

export const lightTheme: Theme = {
  mode: 'light',
  accent: '#F8836B',
  accentPress: '#E96F57',
  accentSoft: '#FFD9C7',
  accentSofter: '#FFEBE1',
  bg: '#FFF8F4',
  surface: '#FFFFFF',
  surface2: '#FFF3EC',
  hairline: '#F0E4DB',
  success: '#6BBF8A',
  successSoft: '#E2F1E8',
  caution: '#E8B04B',
  cautionSoft: '#FBEFD6',
  text: '#2A2320',
  text2: '#6E635C',
  text3: '#A99E96',
  pro: '#C07A9E',
  carb: '#E0A45C',
  fat: '#7CA6C9',
  proSoft: '#F3E4ED',
  carbSoft: '#F7EBDA',
  fatSoft: '#E6EEF6',
  chartGrid: '#F0E4DB',
  chartRaw: '#E7C3B6',
  chartTrend: '#F8836B',
  shadowSm: { shadowColor: '#4A3026', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  shadow: { shadowColor: '#784632', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 4 },
  shadowLg: { shadowColor: '#784632', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.18, shadowRadius: 34, elevation: 12 },
};

export const darkTheme: Theme = {
  mode: 'dark',
  accent: '#F8836B',
  accentPress: '#FF9B85',
  accentSoft: '#4A332B',
  accentSofter: '#3A2A24',
  bg: '#1E1A18',
  surface: '#2A2320',
  surface2: '#231E1B',
  hairline: '#3A322E',
  success: '#7FCB9B',
  successSoft: '#28332C',
  caution: '#E8BC63',
  cautionSoft: '#352D20',
  text: '#F5EEE8',
  text2: '#B5A89F',
  text3: '#80736B',
  pro: '#D194B4',
  carb: '#E9B776',
  fat: '#97BCDD',
  proSoft: '#352630',
  carbSoft: '#352B1F',
  fatSoft: '#23303B',
  chartGrid: '#3A322E',
  chartRaw: '#5A463E',
  chartTrend: '#F8836B',
  shadowSm: { shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 1 },
  shadow: { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 6 },
  shadowLg: { shadowColor: '#000000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.55, shadowRadius: 40, elevation: 16 },
};

// ── Typography — Nunito families by weight (loaded in App.tsx) ──────────────
export const Font = {
  400: 'Nunito_400Regular',
  500: 'Nunito_500Medium',
  600: 'Nunito_600SemiBold',
  700: 'Nunito_700Bold',
  800: 'Nunito_800ExtraBold',
  900: 'Nunito_900Black',
} as const;
export type FontWeight = keyof typeof Font;

// ── Scale tokens (theme.jsx: space / radius) ───────────────────────────────
export const Space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const Radius = { sm: 10, chip: 14, card: 20, pill: 999 } as const;

// Tabular numerals (the design's .fs-num) — keeps figures from jittering as they animate.
export const tnum: TextStyle = { fontVariant: ['tabular-nums'] };

// ── Provider ───────────────────────────────────────────────────────────────
const ThemeCtx = createContext<Theme>(lightTheme);
export const useTheme = (): Theme => useContext(ThemeCtx);

export function ThemeProvider({ children, mode }: { children: React.ReactNode; mode?: ThemeMode }) {
  const sys = useColorScheme();
  const resolved: ThemeMode = mode ?? (sys === 'dark' ? 'dark' : 'light');
  const theme = resolved === 'dark' ? darkTheme : lightTheme;
  return React.createElement(ThemeCtx.Provider, { value: theme }, children);
}
