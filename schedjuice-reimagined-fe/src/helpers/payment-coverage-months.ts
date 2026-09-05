/** Calendar months between two dates (inclusive), for payment coverage pickers. */

export type CoverageMonthOption = {
  year: number;
  month_index: number;
  label: string;
};

export function formatMonthLong(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex - 1, 1);
  return d.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function calendarMonthsBetweenInclusive(
  start: Date,
  end: Date,
): CoverageMonthOption[] {
  const out: CoverageMonthOption[] = [];
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  let y = a.getFullYear();
  let m = a.getMonth() + 1;
  const endY = b.getFullYear();
  const endM = b.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    const iso = `${y}-${String(m).padStart(2, "0")}`;
    const label = `${formatMonthLong(y, m)} (${iso})`;
    out.push({ year: y, month_index: m, label });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${monthIndex}`;
}

/** Selected keys for checkboxes from API payment (explicit rows or implicit issued_at only). */
export function selectedMonthKeysFromPayment(payment: {
  issued_at: string | null;
  covered_months?: { year: number; month_index: number }[];
}): Set<string> {
  if (payment.covered_months && payment.covered_months.length > 0) {
    return new Set(
      payment.covered_months.map((x) => monthKey(x.year, x.month_index)),
    );
  }
  if (payment.issued_at) {
    const d = new Date(payment.issued_at);
    if (!Number.isNaN(d.getTime())) {
      return new Set([monthKey(d.getFullYear(), d.getMonth() + 1)]);
    }
  }
  return new Set();
}

/** Earliest calendar month a payment covers (explicit rows, else implicit issued_at). */
export function earliestCoverageMonth(payment: {
  covered_months?: { year: number; month_index: number }[] | null;
  issued_at?: string | null;
}): { year: number; month_index: number } | null {
  if (payment.covered_months && payment.covered_months.length > 0) {
    const sorted = dedupeSortCoveredMonths(payment.covered_months);
    return sorted[0] ?? null;
  }
  if (payment.issued_at) {
    const d = new Date(payment.issued_at);
    if (!Number.isNaN(d.getTime())) {
      return { year: d.getFullYear(), month_index: d.getMonth() + 1 };
    }
  }
  return null;
}

function dedupeSortCoveredMonths(
  months: { year: number; month_index: number }[],
): { year: number; month_index: number }[] {
  const map = new Map<
    string,
    { year: number; month_index: number }
  >();
  for (const m of months) {
    const k = monthKey(m.year, m.month_index);
    map.set(k, { year: m.year, month_index: m.month_index });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month_index - b.month_index,
  );
}

function monthsAreConsecutive(
  sorted: { year: number; month_index: number }[],
): boolean {
  if (sorted.length < 2) {
    return true;
  }
  for (let i = 1; i < sorted.length; i += 1) {
    let y = sorted[i - 1].year;
    let m = sorted[i - 1].month_index + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (sorted[i].year !== y || sorted[i].month_index !== m) {
      return false;
    }
  }
  return true;
}

function describeCoverageMonthsFallback(
  covered: { year: number; month_index: number }[],
): string {
  return covered
    .map((m) => formatMonthLong(m.year, m.month_index))
    .join(", ");
}

/**
 * Human-readable coverage for tables: full course range → "All months";
 * consecutive → "From … to …"; gaps → comma-separated months.
 */
export function describePaymentCoverageDisplay(opts: {
  covered_months: { year: number; month_index: number }[];
  issued_at?: string | null;
  course_start_date: string;
  course_end_date: string;
}): string {
  let covered = dedupeSortCoveredMonths(opts.covered_months);
  if (covered.length === 0 && opts.issued_at) {
    const d = new Date(opts.issued_at);
    if (!Number.isNaN(d.getTime())) {
      covered = [
        {
          year: d.getFullYear(),
          month_index: d.getMonth() + 1,
        },
      ];
    }
  }
  if (covered.length === 0) {
    return "—";
  }

  const courseStart = new Date(opts.course_start_date);
  const courseEnd = new Date(opts.course_end_date);
  if (
    Number.isNaN(courseStart.getTime()) ||
    Number.isNaN(courseEnd.getTime())
  ) {
    return describeCoverageMonthsFallback(covered);
  }

  const courseMonths = calendarMonthsBetweenInclusive(courseStart, courseEnd);
  const courseKeySet = new Set(
    courseMonths.map((m) => monthKey(m.year, m.month_index)),
  );
  const coveredKeySet = new Set(
    covered.map((m) => monthKey(m.year, m.month_index)),
  );

  if (
    courseKeySet.size > 0 &&
    courseKeySet.size === coveredKeySet.size &&
    Array.from(courseKeySet).every((k) => coveredKeySet.has(k))
  ) {
    return "All months";
  }

  if (covered.length === 1) {
    return formatMonthLong(covered[0].year, covered[0].month_index);
  }

  if (monthsAreConsecutive(covered)) {
    const first = covered[0];
    const last = covered[covered.length - 1];
    return `From ${formatMonthLong(first.year, first.month_index)} to ${formatMonthLong(last.year, last.month_index)}`;
  }

  return describeCoverageMonthsFallback(covered);
}

/** Cumulative installment coverage for admin report rows. */
export function describeInstallmentCoverageDisplay(opts: {
  installment_cumulative_percent?: string | null;
  installment_covered_through?: { year: number; month_index: number } | null;
}): string | null {
  const pctRaw = opts.installment_cumulative_percent;
  const through = opts.installment_covered_through;
  if (!through && (!pctRaw || pctRaw === "0")) {
    return null;
  }
  const parts: string[] = [];
  if (pctRaw) {
    const n = Number.parseFloat(pctRaw);
    if (!Number.isNaN(n) && n > 0) {
      parts.push(`${n % 1 === 0 ? n.toFixed(0) : n}% paid`);
    }
  }
  if (through) {
    parts.push(
      `covered through ${formatMonthLong(through.year, through.month_index)}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
