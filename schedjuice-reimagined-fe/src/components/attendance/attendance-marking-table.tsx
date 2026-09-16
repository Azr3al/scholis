"use client";

import { AttendanceActionCell } from "@/components/attendance/attendance-action-cell";
import { AttendanceNoteField } from "@/components/attendance/attendance-note-field";
import { AttendanceRowSaveIndicator } from "@/components/attendance/attendance-row-save-indicator";
import { AttendanceStatusControl } from "@/components/attendance/attendance-status-control";
import type { RowSaveState } from "@/components/attendance/use-attendance-autosave";
import { Tooltip } from "@/components/primitives/tooltip";
import {
  DURATION,
  staggerItem,
  staggerList,
  staggerRowDelay,
} from "@/lib/sj/motion";
import {
  playStaggerTick,
  STAGGER_ENTRANCE_ROW_CAP,
} from "@/lib/sound/stagger-tick-sound";
import {
  DEFAULT_SORT,
  sortAttendanceRows,
  type AttendanceMarkingSortColumn,
  type AttendanceMarkingSortState,
} from "@/helpers/attendance-marking-sort";
import type { AttendanceRow } from "@/helpers/attendance-marking-roster";
import { courseOperationalTableShellClassName } from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";
import { attendanceStatus, type attendanceType } from "@/types/attendance";
import { NavArrowDown, NavArrowUp } from "iconoir-react";
import { motion, useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type AnimationEvent, type CSSProperties } from "react";

type AttendanceMarkingTableProps = {
  rows: attendanceType[];
  isMobile: boolean;
  rowStates: Record<number, RowSaveState>;
  recentlyChangedIds: number[];
  onStatusChange: (rowId: number, status: attendanceType["attendance_status"]) => void;
  onNoteChange: (rowId: number, note: string) => void;
  /** True only for the first roster reveal on this page visit. */
  enableStaggerEntrance?: boolean;
  /** Called once when entrance animation is latched on first mount. */
  onInitialEntranceLatched?: () => void;
  /** When this value changes, sort resets to Student A→Z. Pass current event id from the page. */
  sortResetKey?: number;
};

const STAGGER_ANIMATION_NAME = "sj-attendance-row-fade";
const STATIC_ROWS_DEFER_MS =
  (staggerRowDelay(STAGGER_ENTRANCE_ROW_CAP - 1) + DURATION.normal) * 1000;

const ENROLLMENT_COL_CLASS = "min-w-[7.5rem] w-[7.5rem] whitespace-nowrap";

function enrollmentLabel(row: AttendanceRow) {
  if (row.is_removed) {
    return <span className="text-xs text-text-muted">Removed</span>;
  }
  return <span className="text-xs text-text-muted">Active student</span>;
}

function rowClassName(
  row: attendanceType,
  recentlyChangedIds: number[],
  extra?: string,
) {
  const isUnregistered = row.attendance_status === attendanceStatus.unregistered;
  const recentlyChanged = recentlyChangedIds.includes(row.id);

  return cn(
    extra,
    isUnregistered && !recentlyChanged && "bg-surface-sunken",
    recentlyChanged && "bg-brand/5",
  );
}

type DesktopRowCellsProps = {
  row: attendanceType;
  rowSaveState: RowSaveState;
  onStatusChange: AttendanceMarkingTableProps["onStatusChange"];
  onNoteChange: AttendanceMarkingTableProps["onNoteChange"];
};

const DesktopRowCells = memo(function DesktopRowCells({
  row,
  rowSaveState,
  onStatusChange,
  onNoteChange,
}: DesktopRowCellsProps) {
  return (
    <>
      <td className="px-3 py-3 font-medium text-text-primary">{row.user.name}</td>
      <td className="px-3 py-3 text-text-secondary">
        {row.user.alternative_name || "—"}
      </td>
      <td className="px-3 py-3 text-text-secondary">
        {row.user.phone_number || "—"}
      </td>
      <td className={cn("px-3 py-3", ENROLLMENT_COL_CLASS)}>
        {enrollmentLabel(row as AttendanceRow)}
      </td>
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <AttendanceRowSaveIndicator state={rowSaveState} />
          <AttendanceStatusControl
            value={row.attendance_status}
            isMobile={false}
            onChange={(nextStatus) => onStatusChange(row.id, nextStatus)}
            aria-label={`Attendance status for ${row.user.name}`}
          />
        </div>
      </td>
      <td className="px-3 py-3">
        <AttendanceNoteField
          id={`note-${row.id}`}
          value={row.attendance_note || ""}
          status={row.attendance_status}
          onChange={(nextNote) => onNoteChange(row.id, nextNote)}
        />
      </td>
    </>
  );
});

type MobileRowCellProps = {
  row: attendanceType;
  rowSaveState: RowSaveState;
  recentlyChanged: boolean;
  onStatusChange: AttendanceMarkingTableProps["onStatusChange"];
  onNoteChange: AttendanceMarkingTableProps["onNoteChange"];
};

const MobileRowCell = memo(function MobileRowCell({
  row,
  rowSaveState,
  recentlyChanged,
  onStatusChange,
  onNoteChange,
}: MobileRowCellProps) {
  return (
    <AttendanceActionCell
      rowId={row.id}
      status={row.attendance_status}
      note={row.attendance_note || ""}
      studentName={row.user.name}
      alternateName={row.user.alternative_name ?? null}
      isDroppedOut={false}
      rowSaveState={rowSaveState}
      recentlyChanged={recentlyChanged}
      isMobile
      onStatusChange={onStatusChange}
      onNoteChange={onNoteChange}
    />
  );
});

function useStaggerSound(index: number, enabled: boolean) {
  const soundsPlayedRef = useRef(new Set<number>());

  const playTick = useCallback(() => {
    if (!enabled || soundsPlayedRef.current.has(index)) return;
    soundsPlayedRef.current.add(index);
    void playStaggerTick(index);
  }, [enabled, index]);

  const handleCssAnimationStart = useCallback(
    (e: AnimationEvent<HTMLTableRowElement>) => {
      if (e.animationName !== STAGGER_ANIMATION_NAME) return;
      playTick();
    },
    [playTick],
  );

  const handleMotionAnimationStart = useCallback(
    (definition: string | object) => {
      if (definition !== "show") return;
      playTick();
    },
    [playTick],
  );

  return { handleCssAnimationStart, handleMotionAnimationStart };
}

function AttendanceMarkingEntrance({
  rows,
  isMobile,
  rowStates,
  recentlyChangedIds,
  onStatusChange,
  onNoteChange,
  enableStaggerEntrance,
  onInitialEntranceLatched,
  sortState,
  onSort,
}: AttendanceMarkingTableProps & {
  sortState: AttendanceMarkingSortState;
  onSort: (column: AttendanceMarkingSortColumn) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [latchedEntrance] = useState(() => enableStaggerEntrance);

  useEffect(() => {
    if (latchedEntrance) onInitialEntranceLatched?.();
  }, [latchedEntrance, onInitialEntranceLatched]);

  const [entranceComplete, setEntranceComplete] = useState(false);
  const [showStaticRows, setShowStaticRows] = useState(false);

  const animateEntrance =
    latchedEntrance && reducedMotion !== true && rows.length > 0;

  const staggerRows = animateEntrance
    ? rows.slice(0, STAGGER_ENTRANCE_ROW_CAP)
    : [];
  const staticRows = animateEntrance
    ? rows.slice(STAGGER_ENTRANCE_ROW_CAP)
    : rows;

  useEffect(() => {
    if (!animateEntrance) {
      setShowStaticRows(true);
      setEntranceComplete(true);
      return;
    }

    setShowStaticRows(false);
    setEntranceComplete(false);

    const staticTimer = window.setTimeout(
      () => setShowStaticRows(true),
      STATIC_ROWS_DEFER_MS,
    );
    const completeTimer = window.setTimeout(
      () => setEntranceComplete(true),
      STATIC_ROWS_DEFER_MS,
    );

    return () => {
      clearTimeout(staticTimer);
      clearTimeout(completeTimer);
    };
  }, [animateEntrance]);

  const useLiveProps = !animateEntrance || entranceComplete;
  const displayRowStates = useLiveProps ? rowStates : {};
  const displayRecentlyChangedIds = useLiveProps ? recentlyChangedIds : [];

  if (isMobile) {
    if (!animateEntrance) {
      return (
        <div className="divide-y divide-border-subtle">
          {rows.map((row) => (
            <div
              key={row.id}
              className={rowClassName(row, recentlyChangedIds, "px-1 py-4")}
            >
              <MobileRowCell
                row={row}
                rowSaveState={rowStates[row.id] ?? "idle"}
                recentlyChanged={recentlyChangedIds.includes(row.id)}
                onStatusChange={onStatusChange}
                onNoteChange={onNoteChange}
              />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="divide-y divide-border-subtle">
        <motion.div variants={staggerList} initial="hidden" animate="show">
          {staggerRows.map((row, index) => (
            <StaggerMobileRow
              key={row.id}
              row={row}
              index={index}
              onStatusChange={onStatusChange}
              onNoteChange={onNoteChange}
            />
          ))}
        </motion.div>
        {showStaticRows &&
          staticRows.map((row) => (
            <div
              key={row.id}
              className={rowClassName(row, recentlyChangedIds, "px-1 py-4")}
            >
              <MobileRowCell
                row={row}
                rowSaveState={rowStates[row.id] ?? "idle"}
                recentlyChanged={recentlyChangedIds.includes(row.id)}
                onStatusChange={onStatusChange}
                onNoteChange={onNoteChange}
              />
            </div>
          ))}
      </div>
    );
  }

  const tbodyContent = (
    <tbody>
      {staggerRows.map((row, index) => (
        <StaggerDesktopRow
          key={row.id}
          row={row}
          index={index}
          rowSaveState={displayRowStates[row.id] ?? "idle"}
          onStatusChange={onStatusChange}
          onNoteChange={onNoteChange}
        />
      ))}
      {(animateEntrance ? (showStaticRows ? staticRows : []) : rows).map((row) => (
        <tr
          key={row.id}
          className={rowClassName(
            row,
            displayRecentlyChangedIds,
            "min-h-[52px] border-b border-border-subtle",
          )}
        >
          <DesktopRowCells
            row={row}
            rowSaveState={displayRowStates[row.id] ?? "idle"}
            onStatusChange={onStatusChange}
            onNoteChange={onNoteChange}
          />
        </tr>
      ))}
    </tbody>
  );

  return (
    <Tooltip.Provider delay={300}>
      <div className={cn(courseOperationalTableShellClassName(), "pb-24 sj-root")}>
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              {SORTABLE_HEADERS.map(({ column, label }) => (
                <AttendanceSortableHeader
                  key={column}
                  column={column}
                  label={label}
                  sortState={sortState}
                  onSort={onSort}
                />
              ))}
              {STATIC_HEADERS.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-muted"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          {tbodyContent}
        </table>
      </div>
    </Tooltip.Provider>
  );
}

type StaggerDesktopRowProps = {
  row: attendanceType;
  index: number;
  rowSaveState: RowSaveState;
  onStatusChange: AttendanceMarkingTableProps["onStatusChange"];
  onNoteChange: AttendanceMarkingTableProps["onNoteChange"];
};

function StaggerDesktopRow({
  row,
  index,
  rowSaveState,
  onStatusChange,
  onNoteChange,
}: StaggerDesktopRowProps) {
  const { handleCssAnimationStart } = useStaggerSound(index, true);

  return (
    <tr
      className={rowClassName(
        row,
        [],
        "sj-attendance-row-stagger min-h-[52px] border-b border-border-subtle",
      )}
      style={
        {
          "--stagger-delay": `${staggerRowDelay(index) * 1000}ms`,
        } as CSSProperties
      }
      onAnimationStartCapture={handleCssAnimationStart}
    >
      <DesktopRowCells
        row={row}
        rowSaveState={rowSaveState}
        onStatusChange={onStatusChange}
        onNoteChange={onNoteChange}
      />
    </tr>
  );
}

type StaggerMobileRowProps = {
  row: attendanceType;
  index: number;
  onStatusChange: AttendanceMarkingTableProps["onStatusChange"];
  onNoteChange: AttendanceMarkingTableProps["onNoteChange"];
};

function StaggerMobileRow({
  row,
  index,
  onStatusChange,
  onNoteChange,
}: StaggerMobileRowProps) {
  const { handleMotionAnimationStart } = useStaggerSound(index, true);

  return (
    <motion.div
      variants={staggerItem}
      onAnimationStart={handleMotionAnimationStart}
      className={rowClassName(row, [], "px-1 py-4")}
    >
      <MobileRowCell
        row={row}
        rowSaveState="idle"
        recentlyChanged={false}
        onStatusChange={onStatusChange}
        onNoteChange={onNoteChange}
      />
    </motion.div>
  );
}

const SORTABLE_HEADERS: {
  column: AttendanceMarkingSortColumn;
  label: string;
}[] = [
  { column: "student", label: "Student" },
  { column: "altName", label: "Alt name" },
  { column: "phone", label: "Phone" },
  { column: "enrollment", label: "Enrollment" },
];

const STATIC_HEADERS = ["Status", "Note"] as const;

type AttendanceSortableHeaderProps = {
  label: string;
  column: AttendanceMarkingSortColumn;
  sortState: AttendanceMarkingSortState;
  onSort: (column: AttendanceMarkingSortColumn) => void;
};

function AttendanceSortableHeader({
  label,
  column,
  sortState,
  onSort,
}: AttendanceSortableHeaderProps) {
  const isActive = sortState.column === column;
  const ariaSort = isActive
    ? sortState.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "px-3 py-2 text-left",
        column === "enrollment" && ENROLLMENT_COL_CLASS,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide",
          isActive
            ? "text-text-primary"
            : "text-text-muted hover:text-text-secondary",
        )}
      >
        {label}
        {isActive ? (
          sortState.direction === "asc" ? (
            <NavArrowUp width={14} height={14} aria-hidden className="shrink-0" />
          ) : (
            <NavArrowDown width={14} height={14} aria-hidden className="shrink-0" />
          )
        ) : (
          <span className="inline-block size-3.5 shrink-0 opacity-0" aria-hidden />
        )}
      </button>
    </th>
  );
}

export function AttendanceMarkingTable({
  sortResetKey,
  rows,
  ...rest
}: AttendanceMarkingTableProps) {
  const [sortState, setSortState] =
    useState<AttendanceMarkingSortState>(DEFAULT_SORT);

  useEffect(() => {
    setSortState(DEFAULT_SORT);
  }, [sortResetKey]);

  const sortedRows = useMemo(
    () => sortAttendanceRows(rows, sortState),
    [rows, sortState],
  );

  const handleSort = useCallback((column: AttendanceMarkingSortColumn) => {
    setSortState((prev) => {
      if (prev.column === column) {
        return {
          column,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { column, direction: "asc" };
    });
  }, []);

  return (
    <AttendanceMarkingEntrance
      {...rest}
      rows={sortedRows}
      sortState={sortState}
      onSort={handleSort}
    />
  );
}
