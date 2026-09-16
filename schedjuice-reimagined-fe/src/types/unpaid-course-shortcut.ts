/** FM/HM filter for unpaid-by-course shortcut (matches getCourseMonthType / backend). */
export enum UnpaidShortcutCourseMonthFilter {
  All = "all",
  FM = "FM",
  HM = "HM",
}

export function parseCourseMonthFilter(
  raw: string | null,
): UnpaidShortcutCourseMonthFilter {
  if (raw === UnpaidShortcutCourseMonthFilter.FM) {
    return UnpaidShortcutCourseMonthFilter.FM;
  }
  if (raw === UnpaidShortcutCourseMonthFilter.HM) {
    return UnpaidShortcutCourseMonthFilter.HM;
  }
  return UnpaidShortcutCourseMonthFilter.All;
}
