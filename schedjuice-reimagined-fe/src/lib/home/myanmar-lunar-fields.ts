export type MoonPhaseIndex = 0 | 1 | 2 | 3;

export function deriveLunarFields(myanmarDate: {
  monthDay: number;
  monthLength: number;
}): { fortnightDay: number; moonPhaseIndex: MoonPhaseIndex } {
  const { monthDay, monthLength } = myanmarDate;
  const moonPhaseRaw =
    Math.floor((monthDay + 1) / 16) +
    Math.floor(monthDay / 16) +
    Math.floor(monthDay / monthLength);
  const fortnightDay = monthDay - 15 * Math.floor(monthDay / 16);
  return {
    fortnightDay,
    moonPhaseIndex: Math.min(3, Math.max(0, moonPhaseRaw)) as MoonPhaseIndex,
  };
}
