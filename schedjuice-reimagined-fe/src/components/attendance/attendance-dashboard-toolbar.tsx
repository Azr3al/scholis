"use client";

import Link from "next/link";
import { NavArrowRight, Search } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import { buttonVariants } from "@/components/primitives/button";
import { AttendanceMonthSelect } from "@/components/attendance/attendance-month-select";
import { IncludeRemovedStudentsToggle } from "@/components/attendance/include-removed-students-toggle";
import type { MonthOption } from "@/helpers/attendance-dashboard";
import { cn } from "@/lib/utils";

export function AttendanceDashboardToolbar({
  courseId,
  searchTerm,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  months,
  disabled,
  canToggleIncludeRemoved,
  includeRemoved,
  onIncludeRemovedChange,
}: {
  courseId: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  dateRange: string;
  onDateRangeChange: (value: string) => void;
  months: MonthOption[];
  disabled?: boolean;
  canToggleIncludeRemoved?: boolean;
  includeRemoved?: boolean;
  onIncludeRemovedChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Search
          width={15}
          height={15}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <Input
          type="search"
          placeholder="Search student"
          className="pl-9"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      <AttendanceMonthSelect
        value={dateRange}
        onValueChange={onDateRangeChange}
        months={months}
        disabled={disabled}
      />
      {canToggleIncludeRemoved && onIncludeRemovedChange ? (
        <IncludeRemovedStudentsToggle
          checked={includeRemoved ?? false}
          onCheckedChange={onIncludeRemovedChange}
          disabled={disabled}
          className="self-end pb-1"
        />
      ) : null}
      <Link
        href={`/courses/${courseId}/attendance/marking/today`}
        className={cn(
          buttonVariants({ size: "md" }),
          "inline-flex shrink-0 gap-2 self-end",
          "bg-[var(--data-green-strong,#2f6e58)] text-white hover:bg-[color-mix(in_srgb,var(--data-green-strong,#2f6e58)_88%,#000)]",
        )}
      >
        Mark attendance
        <NavArrowRight width={16} height={16} aria-hidden />
      </Link>
    </div>
  );
}
