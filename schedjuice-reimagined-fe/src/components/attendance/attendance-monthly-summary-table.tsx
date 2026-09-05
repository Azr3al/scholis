"use client";

import { Sheet } from "@/components/primitives/sheet";
import {
  filterSummaryStudentsBySearch,
  formatAttendanceFraction,
} from "@/helpers/attendance-dashboard";
import { attendanceRateBadgeClass } from "@/helpers/attendance-god-view";
import { popIn } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import type {
  CourseAttendanceSummary,
  CourseAttendanceSummaryStudent,
} from "@/types/attendance";
import { NavArrowRight } from "iconoir-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";

type AttendanceMonthlySummaryTableProps = {
  summary: CourseAttendanceSummary;
  searchTerm: string;
};

const STICKY =
  "sticky left-0 z-10 min-w-[9rem] max-w-[12rem] border-r border-border-subtle bg-surface-elevated";

type StudentDetail = {
  name: string;
  coursePct: number;
  months: { label: string; pct: number; attended: number; total: number }[];
};

function buildStudentDetail(
  student: CourseAttendanceSummaryStudent,
  summary: CourseAttendanceSummary,
): StudentDetail {
  return {
    name: student.name,
    coursePct: student.course.pct,
    months: summary.months.map((month) => {
      const counts = student.by_month[month.anchor] ?? {
        attended: 0,
        total: 0,
        pct: 0,
      };
      return {
        label: month.label,
        pct: counts.pct,
        attended: counts.attended,
        total: counts.total,
      };
    }),
  };
}

function PctCell({
  pct,
  attended,
  total,
  emphasized,
}: {
  pct: number;
  attended: number;
  total: number;
  emphasized?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        emphasized && "font-semibold",
        attendanceRateBadgeClass(pct),
      )}
      title={formatAttendanceFraction(attended, total)}
    >
      {total === 0 ? "—" : `${pct}%`}
    </span>
  );
}

export function AttendanceMonthlySummaryTable({
  summary,
  searchTerm,
}: AttendanceMonthlySummaryTableProps) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);

  const filteredStudents = useMemo(
    () => filterSummaryStudentsBySearch(summary.students, searchTerm),
    [summary.students, searchTerm],
  );

  if (summary.months.length === 0) return null;

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-col md:hidden">
        {filteredStudents.map((student) => {
          const row = buildStudentDetail(student, summary);
          return (
            <button
              key={student.id}
              type="button"
              className="flex w-full items-center gap-3 border-b border-border-subtle px-1 py-4 text-left transition-colors hover:bg-surface-hover"
              onClick={() => setDetail(row)}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-primary">
                  {student.name}
                  {student.is_removed ? (
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      Removed
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  Course: {row.coursePct}%
                </p>
              </div>
              <NavArrowRight
                width={18}
                height={18}
                aria-hidden
                className="shrink-0 text-text-muted"
              />
            </button>
          );
        })}
      </div>

      <div className="hidden min-w-0 overflow-x-auto sj-scroll md:block">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className={cn(STICKY, "px-3 py-3 text-left font-medium")}>
                Student name
              </th>
              {summary.months.map((month) => (
                <th
                  key={month.anchor}
                  className="min-w-[5rem] px-3 py-3 text-left text-xs uppercase tracking-wide"
                >
                  {month.label.split(" ")[0]}
                </th>
              ))}
              <th className="min-w-[5rem] px-3 py-3 text-left text-xs uppercase tracking-wide">
                Course
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => (
              <tr
                key={student.id}
                className="min-h-[52px] border-b border-border-subtle"
              >
                <td
                  className={cn(STICKY, "px-3 py-3 font-medium text-text-primary")}
                >
                  {student.name}
                  {student.is_removed ? (
                    <span className="mt-0.5 block text-xs font-normal text-text-muted">
                      Removed
                    </span>
                  ) : null}
                </td>
                {summary.months.map((month) => {
                  const counts = student.by_month[month.anchor] ?? {
                    attended: 0,
                    total: 0,
                    pct: 0,
                  };
                  return (
                    <td key={month.anchor} className="px-3 py-3">
                      <PctCell
                        pct={counts.pct}
                        attended={counts.attended}
                        total={counts.total}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-3">
                  <PctCell
                    pct={student.course.pct}
                    attended={student.course.attended}
                    total={student.course.total}
                    emphasized
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet.Root
        open={detail != null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <Sheet.Portal>
          <Sheet.Backdrop />
          <Sheet.Popup
            side="bottom"
            className="gap-0 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
          >
            {detail ? (
              <motion.div
                variants={popIn}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <div className="space-y-1 text-left">
                  <Sheet.Title className="text-balance text-xl">
                    {detail.name}
                  </Sheet.Title>
                  <p className="text-sm text-text-muted">
                    Course: {detail.coursePct}%
                  </p>
                </div>
                <p className="mt-4 mb-2 text-xs uppercase tracking-wide text-text-muted">
                  By month
                </p>
                <ul className="flex flex-col gap-2">
                  {detail.months.map((month) => (
                    <li
                      key={month.label}
                      className="flex items-center justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0"
                    >
                      <span className="text-sm text-text-primary">{month.label}</span>
                      <span
                        className={cn(
                          "font-mono text-sm tabular-nums",
                          attendanceRateBadgeClass(month.pct),
                        )}
                      >
                        {month.total === 0
                          ? "—"
                          : `${month.pct}% (${formatAttendanceFraction(month.attended, month.total)})`}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : null}
          </Sheet.Popup>
        </Sheet.Portal>
      </Sheet.Root>
    </div>
  );
}
