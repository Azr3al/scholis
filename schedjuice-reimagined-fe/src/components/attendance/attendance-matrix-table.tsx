"use client";

import { AttendanceStatusLabel } from "@/components/attendance/attendance-status-label";
import { Sheet } from "@/components/primitives/sheet";
import { getTodayYmd } from "@/helpers/attendance-marking";
import {
  normalizeSessionHeaderDate,
  parseAttendanceMatrix,
} from "@/helpers/attendance-dashboard";
import { formatDate } from "@/helpers/date";
import { popIn } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { NavArrowRight } from "iconoir-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

type StudentDetail = {
  name: string;
  total: string;
  percentage: string;
  sessions: { label: string; status: string }[];
};

type AttendanceMatrixTableProps = {
  data: string[][];
  rowMeta?: Array<{ id?: number; is_removed?: boolean }>;
  dateRange: string;
  highlightDate: string | null;
  /** When set, scroll that student row into view and briefly highlight it. */
  highlightStudentId?: number | null;
  onHighlightStudentConsumed?: () => void;
};

const STICKY =
  "sticky left-0 z-10 min-w-[9rem] max-w-[12rem] border-r border-border-subtle bg-surface-elevated";

function buildStudentDetail(
  row: { name: string; total: string; percentage: string; statuses: string[] },
  sessionHeaders: string[],
): StudentDetail {
  return {
    name: row.name,
    total: row.total,
    percentage: row.percentage,
    sessions: sessionHeaders.map((header, index) => ({
      label: formatDate(header, "MMM d, yyyy (EEE)"),
      status: String(row.statuses[index] ?? "—"),
    })),
  };
}

export function AttendanceMatrixTable({
  data,
  rowMeta,
  dateRange,
  highlightDate,
  highlightStudentId = null,
  onHighlightStudentConsumed,
}: AttendanceMatrixTableProps) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const highlightRef = useRef<HTMLTableCellElement>(null);
  const matrixRootRef = useRef<HTMLDivElement>(null);
  const [pulsingStudentId, setPulsingStudentId] = useState<number | null>(null);
  const parsed = useMemo(() => parseAttendanceMatrix(data), [data]);

  useEffect(() => {
    if (!highlightDate || !highlightRef.current) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    highlightRef.current.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [highlightDate, dateRange]);

  useEffect(() => {
    if (highlightStudentId == null) return;

    const root = matrixRootRef.current;
    const candidates = root
      ? Array.from(
          root.querySelectorAll<HTMLElement>(
            `[data-perfect-row="${highlightStudentId}"]`,
          ),
        )
      : [];
    const node =
      candidates.find((el) => el.offsetParent !== null) ?? candidates[0];
    if (!node) {
      onHighlightStudentConsumed?.();
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    node.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    setPulsingStudentId(highlightStudentId);

    const clearMs = prefersReducedMotion ? 0 : 1200;
    const timer = window.setTimeout(() => {
      setPulsingStudentId(null);
      onHighlightStudentConsumed?.();
    }, clearMs);

    return () => window.clearTimeout(timer);
  }, [highlightStudentId, onHighlightStudentConsumed]);

  if (!parsed) return null;

  const { sessionHeaders, rows } = parsed;
  const todayYmd = getTodayYmd();

  return (
    <div ref={matrixRootRef} className="min-w-0 max-w-full">
      <div className="flex flex-col md:hidden">
        {rows.map((row, index) => {
          const student = buildStudentDetail(row, sessionHeaders);
          const isRemoved = rowMeta?.[index]?.is_removed;
          const studentId = rowMeta?.[index]?.id;
          const isPulsing =
            studentId != null && pulsingStudentId === studentId;
          return (
            <button
              key={studentId ?? `${student.name}-${index}`}
              type="button"
              data-perfect-row={studentId}
              className={cn(
                "flex w-full items-center gap-3 border-b border-border-subtle px-1 py-4 text-left transition-colors hover:bg-surface-hover",
                isPulsing && "bg-brand/10",
              )}
              onClick={() => setDetail(student)}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-primary">
                  {student.name}
                  {isRemoved ? (
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      Removed
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-text-muted">
                  {student.total} sessions · {student.percentage}%
                </p>
              </div>
              <NavArrowRight width={18} height={18} aria-hidden className="shrink-0 text-text-muted" />
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
              <th className="min-w-[5rem] px-3 py-3 text-left text-xs uppercase tracking-wide">
                Total
              </th>
              <th className="min-w-[4rem] px-3 py-3 text-left text-xs uppercase tracking-wide">
                %
              </th>
              {sessionHeaders.map((header, colIndex) => {
                const ymd = normalizeSessionHeaderDate(header);
                const isHighlight =
                  highlightDate != null && ymd === highlightDate;
                return (
                  <th
                    key={`${header}-${colIndex}`}
                    ref={isHighlight ? highlightRef : undefined}
                    className={cn(
                      "min-w-[7.5rem] px-3 py-3 text-left text-xs uppercase tracking-wide",
                      isHighlight && "bg-brand/10",
                    )}
                  >
                    <span>{formatDate(header, "MMM d, yyyy")}</span>
                    {isHighlight && ymd === todayYmd ? (
                      <span className="mt-0.5 block text-[10px] font-normal normal-case text-text-muted">
                        Today
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isRemoved = rowMeta?.[index]?.is_removed;
              const studentId = rowMeta?.[index]?.id;
              const isPulsing =
                studentId != null && pulsingStudentId === studentId;
              return (
              <tr
                key={studentId ?? `${row.name}-${index}`}
                data-perfect-row={studentId}
                className={cn(
                  "min-h-[52px] border-b border-border-subtle transition-colors",
                  isPulsing && "bg-brand/10",
                )}
              >
                <td
                  className={cn(
                    STICKY,
                    "px-3 py-3 font-medium text-text-primary",
                    isPulsing && "bg-brand/10",
                  )}
                >
                  {row.name}
                  {isRemoved ? (
                    <span className="mt-0.5 block text-xs font-normal text-text-muted">
                      Removed
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-mono tabular-nums">{row.total}</td>
                <td className="px-3 py-3 font-mono tabular-nums">
                  {row.percentage}%
                </td>
                {row.statuses.map((status, colIndex) => {
                  const ymd = normalizeSessionHeaderDate(
                    sessionHeaders[colIndex] ?? "",
                  );
                  const isHighlight =
                    highlightDate != null && ymd === highlightDate;
                  return (
                    <td
                      key={`${row.name}-${colIndex}`}
                      className={cn("px-3 py-3", isHighlight && "bg-brand/8")}
                    >
                      <AttendanceStatusLabel status={status} />
                    </td>
                  );
                })}
              </tr>
            );
            })}
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
                    {detail.total} sessions · {detail.percentage}%
                  </p>
                </div>
                <p className="mt-4 mb-2 text-xs uppercase tracking-wide text-text-muted">
                  Sessions
                </p>
                <ul className="flex flex-col gap-2">
                  {detail.sessions.map((session, index) => (
                    <li
                      key={`${session.label}-${index}`}
                      className="flex items-start justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 text-sm text-text-primary">
                        {session.label}
                      </span>
                      <AttendanceStatusLabel
                        status={session.status}
                        className="shrink-0"
                      />
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
