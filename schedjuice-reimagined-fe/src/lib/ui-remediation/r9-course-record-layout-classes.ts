import type { PageWidth } from "@/lib/layout/page-width";

/** Shared max-width for course hub rail sections (roster tables, galleries, schedule). */
export const COURSE_HUB_PAGE_WIDTH: PageWidth = "wide";

export function courseRecordTabStackClassName(): string {
  return "flex min-w-0 flex-col gap-6";
}

export function courseOperationalTableShellClassName(): string {
  return "min-w-0 overflow-x-auto";
}

export function courseOperationalTableClassName(): string {
  return "w-full min-w-[720px] border-collapse text-sm";
}

export function courseOperationalTableHeadRowClassName(): string {
  return "border-b border-border-subtle text-left";
}

export function courseOperationalTableHeadCellClassName(): string {
  return "whitespace-nowrap px-3 py-2 text-xs font-medium text-text-muted";
}

export function courseOperationalTableBodyCellClassName(): string {
  return "px-3 py-2 align-middle";
}

export function attendanceMarkingToolbarClassName(): string {
  return "sticky top-0 z-sticky flex min-w-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-elevated py-3";
}
