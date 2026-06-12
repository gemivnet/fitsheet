// WeightChart.tsx — raw dots + smooth trend line + dashed goal line, with optional axis
// labels (sparse dates along the bottom, min/max on the left) when points carry dates.
// Width is measured via onLayout so it fills its card.

import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Font, useTheme } from '../theme';

export interface WeightPoint {
  x: number;
  raw: number;
  trend: number;
  date?: string; // YYYY-MM-DD; when present, axis labels render
}

const monthDay = (s: string): string => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function WeightChart({
  data,
  height = 210,
  goal,
  fmtY,
}: {
  data: WeightPoint[];
  height?: number;
  goal?: number;
  /** Formats a raw (lb) value for the y-axis — pass the user's units formatter. */
  fmtY?: (lb: number) => string;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const labeled = data.length > 0 && !!data[0].date;
  const pad = { l: labeled && fmtY ? 40 : 8, r: 8, t: 16, b: labeled ? 24 : 8 };

  const ys = data.flatMap((d) => [d.raw, d.trend]);
  const minY = Math.min(...ys, goal ?? Infinity) - 1;
  const maxY = Math.max(...ys) + 1;
  const X = (i: number) => pad.l + (i / (data.length - 1)) * (width - pad.l - pad.r);
  const Y = (y: number) => pad.t + (1 - (y - minY) / (maxY - minY)) * (height - pad.t - pad.b);

  const trendPath = data.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(d.trend).toFixed(1)}`).join(' ');
  const areaPath = `${trendPath} L${X(data.length - 1).toFixed(1)} ${height - pad.b} L${X(0).toFixed(1)} ${height - pad.b} Z`;

  // first / middle / last dates — enough to orient without clutter
  const xTicks = labeled ? [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])] : [];

  return (
    <View style={{ width: '100%' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fsArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={t.accent} stopOpacity={0.18} />
              <Stop offset="1" stopColor={t.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {goal != null ? (
            <>
              <Line x1={pad.l} x2={width - pad.r} y1={Y(goal)} y2={Y(goal)} stroke={t.success} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" opacity={0.8} />
              <SvgText x={width - pad.r} y={Y(goal) - 7} textAnchor="end" fontSize={12} fontFamily={Font[800]} fill={t.success}>
                goal
              </SvgText>
            </>
          ) : null}
          <Path d={areaPath} fill="url(#fsArea)" />
          <Path d={trendPath} fill="none" stroke={t.chartTrend} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          {data.map((d, i) => (
            <Circle key={i} cx={X(i)} cy={Y(d.raw)} r={3.2} fill={t.surface} stroke={t.chartRaw} strokeWidth={2} />
          ))}
          <Circle cx={X(data.length - 1)} cy={Y(data[data.length - 1].trend)} r={6} fill={t.accent} stroke={t.surface} strokeWidth={3} />
          {labeled && fmtY ? (
            <>
              <SvgText x={2} y={Y(maxY - 1) + 4} fontSize={11} fontFamily={Font[700]} fill={t.text3}>
                {fmtY(maxY - 1)}
              </SvgText>
              <SvgText x={2} y={Y(minY + 1) + 4} fontSize={11} fontFamily={Font[700]} fill={t.text3}>
                {fmtY(minY + 1)}
              </SvgText>
            </>
          ) : null}
          {xTicks.map((i) => (
            <SvgText
              key={`xt-${i}`}
              x={X(i)}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fontFamily={Font[700]}
              fill={t.text3}
            >
              {monthDay(data[i].date!)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
