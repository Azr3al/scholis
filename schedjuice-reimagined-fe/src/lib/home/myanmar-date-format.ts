import { getMyanmarDate, isSabbath } from "mm-cal-js";

import { formatMyanmarDigits } from "./myanmar-digits";
import { deriveLunarFields } from "./myanmar-lunar-fields";
import {
  MOON_PHASE_NAMES_MY,
  MYANMAR_MONTH_NAMES_MY,
  SABBATH_SUFFIX_MY,
  WEEKDAY_NAMES_MY,
} from "./myanmar-date-lexicon";

export function formatTraditionalMyanmarDate(
  date: Date,
  _timeZone: string,
): string {
  const md = getMyanmarDate(date);
  const { fortnightDay, moonPhaseIndex } = deriveLunarFields(md);
  const monthName = MYANMAR_MONTH_NAMES_MY[md.month] ?? "";
  const phaseName = MOON_PHASE_NAMES_MY[moonPhaseIndex] ?? "";
  const weekday = WEEKDAY_NAMES_MY[md.weekDay] ?? "";
  return `${monthName} ${phaseName} ${formatMyanmarDigits(fortnightDay)} ရက် ${weekday}နေ့`;
}

export function formatSabbathSuffix(date: Date): string {
  const flag = isSabbath(date);
  if (flag === 1) return SABBATH_SUFFIX_MY.sabbath;
  if (flag === 2) return SABBATH_SUFFIX_MY.sabbathEve;
  return "";
}

export function formatMyanmarDateline(date: Date, timeZone: string): string {
  return formatTraditionalMyanmarDate(date, timeZone) + formatSabbathSuffix(date);
}
