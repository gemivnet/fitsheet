// units.ts — weights are stored canonical in lb on the server; convert only at the UI edge.

export const LB_PER_KG = 2.2046226218;
export type Units = 'lb' | 'kg';

export const toDisplayWeight = (lb: number, units: Units): number => (units === 'kg' ? lb / LB_PER_KG : lb);
export const fromDisplayWeight = (val: number, units: Units): number => (units === 'kg' ? val * LB_PER_KG : val);
export const fmtWeight = (lb: number, units: Units, dp = 1): string => toDisplayWeight(lb, units).toFixed(dp);
