/** Build a 6×7 month grid (Sun–Sat). Null = outside month. */
export function buildMonthMatrix(year: number, monthIndex: number): (Date | null)[][] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, monthIndex, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function isDateWithinInclusive(date: Date, from: Date, to: Date): boolean {
  const t = date.getTime();
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();
  return t >= start && t <= end;
}

/** Inclusive YYYY-MM-DD range compare (timezone-safe calendar dates). */
export function isYmdWithinInclusive(
  ymd: string,
  fromYmd: string,
  toYmd: string,
): boolean {
  if (!ymd || !fromYmd || !toYmd) return false;
  return ymd >= fromYmd && ymd <= toYmd;
}
