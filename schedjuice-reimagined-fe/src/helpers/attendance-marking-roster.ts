import { roundNumber } from "@/helpers/number";
import {
  attendanceStatus,
  type attendanceType,
  type MarkingRosterRow,
} from "@/types/attendance";
import type { eventType } from "@/types/course";

export type AttendanceRow = attendanceType & { is_removed?: boolean };

export function sameAttendanceRowId(a: number, b: number): boolean {
  return a === b || Number(a) === Number(b);
}

export function findAttendanceRowById(
  rows: AttendanceRow[],
  rowId: number,
): AttendanceRow | undefined {
  return rows.find((row) => sameAttendanceRowId(row.id, rowId));
}

export function rosterSyncFingerprint(
  eventId: number,
  rows: AttendanceRow[],
): string {
  return `${eventId}:${rows
    .map(
      (row) =>
        `${row.id}:${row.attendance_status}:${row.attendance_note ?? ""}`,
    )
    .join("|")}`;
}

export function toAttendanceType(row: MarkingRosterRow): AttendanceRow {
  return {
    id: Number(row.id),
    attendance_status: row.attendance_status,
    attendance_note: row.attendance_note,
    is_extra_class: false,
    is_removed: row.is_removed,
    user: row.user as attendanceType["user"],
    event: { id: row.event_id } as eventType,
  };
}

/** Normalize roster rows that may be raw API shape (event_id) or UI shape (event.id). */
export function ensureAttendanceRow(
  row: AttendanceRow | MarkingRosterRow,
): AttendanceRow {
  if ("event_id" in row) {
    return toAttendanceType(row);
  }
  return row;
}

const PRESENT_STATUSES = [attendanceStatus.present, attendanceStatus.late];

export function computeAttendanceMarkingSummary(rows: AttendanceRow[]) {
  const presentCount = rows.filter((row) =>
    PRESENT_STATUSES.includes(row.attendance_status),
  ).length;
  const totalCount = rows.length;
  const presentPercent =
    totalCount > 0 ? roundNumber((presentCount / totalCount) * 100) : 0;
  return { presentCount, totalCount, presentPercent };
}

/** Merge a server roster refetch with unsaved local edits (dirty rows keep local values). */
export function mergeRosterWithLocalEdits(
  local: AttendanceRow[],
  server: AttendanceRow[],
  dirtyIds: number[],
): AttendanceRow[] {
  const isDirty = (rowId: number) =>
    dirtyIds.some((dirtyId) => sameAttendanceRowId(dirtyId, rowId));
  const localById = new Map(local.map((row) => [row.id, row]));
  return server.map((serverRow) => {
    if (!isDirty(serverRow.id)) return serverRow;
    return (
      local.find((row) => sameAttendanceRowId(row.id, serverRow.id)) ??
      serverRow
    );
  });
}
