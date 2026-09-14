"use client";

import { Select } from "@/components/primitives/select";
import {
  buildCourseYearOptions,
  formatMonthName,
  parseMonthAnchor,
  resolveMonthAnchorForYearChange,
  type MonthOption,
} from "@/helpers/attendance-dashboard";
import { useMemo } from "react";

const ALL_MONTHS_VALUE = "all";

function resolveSelectedYear(value: string, months: MonthOption[]): string {
  if (months.length === 0) {
    return String(new Date().getFullYear());
  }
  if (value === ALL_MONTHS_VALUE) {
    return months[months.length - 1]!.year;
  }
  const parsed = parseMonthAnchor(value);
  if (parsed) return String(parsed.year);
  return months[months.length - 1]!.year;
}

function monthsForYear(months: MonthOption[], year: string): MonthOption[] {
  const filtered = months.filter((m) => m.year === year);
  return filtered.length > 0 ? filtered : months;
}

export function AttendanceMonthSelect({
  value,
  onValueChange,
  months,
  disabled,
  allowAllMonths = true,
}: {
  value: string;
  onValueChange: (value: string) => void;
  months: MonthOption[];
  disabled?: boolean;
  allowAllMonths?: boolean;
}) {
  const yearOptions = useMemo(() => buildCourseYearOptions(months), [months]);
  const showYearSelect = yearOptions.length > 1;
  const selectedYear = resolveSelectedYear(value, months);

  const monthItems = useMemo(() => {
    const yearMonths = monthsForYear(months, selectedYear);
    const monthOptions = yearMonths.map((m) => {
      const parsed = parseMonthAnchor(m.value);
      return {
        value: m.value,
        label: parsed ? formatMonthName(parsed.monthIndex) : m.label,
      };
    });
    if (!allowAllMonths) {
      return monthOptions;
    }
    return [{ value: ALL_MONTHS_VALUE, label: "All months" }, ...monthOptions];
  }, [allowAllMonths, months, selectedYear]);

  const monthValue =
    value === ALL_MONTHS_VALUE && allowAllMonths
      ? ALL_MONTHS_VALUE
      : months.some((m) => m.value === value)
        ? value
        : (monthItems[0]?.value ?? ALL_MONTHS_VALUE);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-[4.5rem] flex-col gap-1.5">
        <span className="text-xs text-text-muted">Year</span>
        {showYearSelect ? (
          <Select
            items={yearOptions}
            value={selectedYear}
            onValueChange={(v) => {
              if (typeof v !== "string") return;
              onValueChange(resolveMonthAnchorForYearChange(value, v, months));
            }}
            disabled={disabled}
            placeholder="Year"
            className="min-w-[5.5rem]"
          />
        ) : (
          <div
            className="flex h-10 items-center text-base text-text-primary"
            aria-label={`Year ${selectedYear}`}
          >
            {selectedYear}
          </div>
        )}
      </div>
      <div className="flex min-w-[9rem] flex-col gap-1.5">
        <span className="text-xs text-text-muted">Month</span>
        <Select
          items={monthItems}
          value={monthValue}
          onValueChange={(v) =>
            onValueChange(typeof v === "string" ? v : ALL_MONTHS_VALUE)
          }
          disabled={disabled || months.length === 0}
          placeholder="Select month"
          className="min-w-[9rem]"
        />
      </div>
    </div>
  );
}
