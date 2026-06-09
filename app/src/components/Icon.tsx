// Icon.tsx — restrained Feather-style line glyphs, ported from the handoff (components.jsx ICONS).
// RN has no `currentColor`, so we default the stroke to the theme's text color; callers override.

import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';

export const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9',
  food: 'M6 3v8a2 2 0 0 0 2 2v8M6 3v5M9 3v5M17.5 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9',
  weight: 'M5 9h14l1.5 11H3.5L5 9Zm4-1a3 3 0 0 1 6 0',
  activity: 'M3 12h4l2.5-7 5 14 2.5-7H21',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5 10 17l9-10',
  chevL: 'M14 6l-6 6 6 6',
  chevR: 'M10 6l6 6-6 6',
  chevD: 'M6 10l6 6 6-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4Zm8 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  flame: 'M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c0-.7-.2-1.3-.5-1.8C16 10 17 12 17 14.5a5 5 0 0 1-10 0C7 10 11 8 12 3Z',
  link: 'M9 14a4 4 0 0 0 5.5.3l2.7-2.7a4 4 0 0 0-5.6-5.6L10 7.5M15 10a4 4 0 0 0-5.5-.3L6.8 12.4a4 4 0 0 0 5.6 5.6L14 16.5',
  star: 'M12 4l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5L7.5 17.6l1-5L4.8 9.2l5-.6Z',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0',
  edit: 'M5 19h3l9-9-3-3-9 9v3ZM14 7l3 3',
  trend: 'M3 17l5-5 4 3 7-8M21 4h-4M21 4v4',
  walk: 'M13 4a1.6 1.6 0 1 0 0-.1ZM11 9l3 2 1 4M8 21l3-6-2-5-3 3M15 13l3 2',
  gear: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM12 3l1 2.5 2.6-.8.6 2.7 2.6 1-1 2.6 1 2.6-2.6 1-.6 2.7-2.6-.8L12 21l-1-2.5-2.6.8-.6-2.7-2.6-1 1-2.6-1-2.6 2.6-1 .6-2.7 2.6.8L12 3Z',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  stroke = 2,
  color,
  fill = 'none',
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
  fill?: string;
}) {
  const theme = useTheme();
  const c = color ?? theme.text;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={c} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d={ICONS[name]} />
    </Svg>
  );
}
