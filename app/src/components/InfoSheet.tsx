// InfoSheet.tsx — a small ⓘ dot that opens a plain-language explanation of a stat.
// One copy map keeps the Analytics jargon ("TDEE", "adherence") explained in the app's
// warm register, so a non-technical reader never has to guess what a number means.

import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Icon } from './Icon';
import { Sheet } from './forms';
import { T } from './primitives';
import { useTheme } from '../theme';

export type InfoTopic = 'maintenance' | 'rate' | 'eta' | 'bank' | 'deficit' | 'streak';

const EXPLAINERS: Record<InfoTopic, { title: string; body: string }> = {
  maintenance: {
    title: 'Estimated maintenance',
    body: 'This is roughly what your body burns in a normal day — measured from your own food logs and weigh-ins, not a generic formula. Eat under it and the trend drifts down. It needs a couple of weeks of logging and at least four weigh-ins before it appears, and the “likely” range shows how sure we are: it tightens as you log more.',
  },
  rate: {
    title: 'Your pace',
    body: 'How fast your smoothed trend weight is moving each week. It’s drawn from a line through your recent weigh-ins, so day-to-day water-weight wobble doesn’t spook it. The ± shows the wiggle room — log a few more weigh-ins and it steadies.',
  },
  eta: {
    title: 'On track for your goal',
    body: 'A gentle projection of when you’d reach your goal weight if your current pace held — shown as a range, because real progress speeds up and slows down. Bodies also adapt over time, so treat the far end as the likelier one. It’s encouragement, not a promise.',
  },
  bank: {
    title: 'Calorie bank',
    body: 'When weekly banking is on, days you eat under your goal bank a little headroom for the rest of the week, and days over borrow it back (capped so a single big day can’t swing things wildly). It’s here so one off day doesn’t feel like a failure.',
  },
  deficit: {
    title: 'Cumulative deficit',
    body: 'The running total of how far under (or over) your goal you’ve been across every day you’ve logged. A positive number means you’ve been under goal overall — the engine behind losing weight over time.',
  },
  streak: {
    title: 'Logging streak',
    body: 'How many days in a row you’ve logged at least one thing. Showing up is the habit that makes everything else work — the number’s just a nudge to keep it going.',
  },
};

export function InfoDot({ topic }: { topic: InfoTopic }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const e = EXPLAINERS[topic];
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} style={{ marginLeft: 5 }}>
        <Icon name="info" size={15} stroke={2} color={t.text3} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={e.title}>
        <T w={600} size={15} color={t.text2} style={{ lineHeight: 23, marginBottom: 8 }}>
          {e.body}
        </T>
      </Sheet>
    </>
  );
}
