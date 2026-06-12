// BankLine.tsx — the weekly calorie-bank status row (shared by Home and the day view).
// Shows what the bank did to today's target, says so when the safety cap kicked in,
// and notes any days that looked partial/erroneous and were left out of the math.

import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { T } from './primitives';
import { useTheme } from '../theme';

interface BankDay {
  bank_week: number;
  bank_snoozed: boolean;
  bank_capped?: boolean;
  bank_skipped_days?: number;
}

export function BankLine({ day, onSnooze }: { day: BankDay; onSnooze: (on: boolean) => void }) {
  const t = useTheme();
  const main = day.bank_snoozed
    ? 'Bank paused today — using your plain goal'
    : day.bank_week > 0
      ? `+${day.bank_week} banked this week — folded into today`
      : `${Math.abs(day.bank_week)} over this week — trimmed from today`;
  const extras: string[] = [];
  if (!day.bank_snoozed && day.bank_capped) extras.push('capped for a steady pace');
  if ((day.bank_skipped_days ?? 0) > 0) extras.push(`${day.bank_skipped_days} odd day${day.bank_skipped_days === 1 ? '' : 's'} left out`);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <Icon
          name={day.bank_snoozed ? 'bell' : day.bank_week > 0 ? 'trend' : 'flame'}
          size={14}
          stroke={2.4}
          color={day.bank_snoozed ? t.text3 : day.bank_week > 0 ? t.success : t.caution}
        />
        <T w={700} size={13} color={t.text2} numberOfLines={2} style={{ flexShrink: 1 }}>
          {main}
          {extras.length ? (
            <T w={600} size={12} color={t.text3}>
              {' '}
              · {extras.join(' · ')}
            </T>
          ) : null}
        </T>
      </View>
      <Pressable
        onPress={() => onSnooze(!day.bank_snoozed)}
        hitSlop={8}
        style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.hairline }}
      >
        <T w={800} size={12} color={t.accentPress}>
          {day.bank_snoozed ? 'Undo' : 'Snooze'}
        </T>
      </Pressable>
    </View>
  );
}
