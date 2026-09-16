import { UNDO_WINDOW_MS } from "@/components/record/inline/undo-core";
import { attendanceStatus, type attendanceType } from "@/types/attendance";

export type MarkAllPresentSnapshot = Map<number, attendanceStatus>;

export function buildMarkAllPresentSnapshot(
  rows: Pick<attendanceType, "id" | "attendance_status">[],
): MarkAllPresentSnapshot {
  const snapshot: MarkAllPresentSnapshot = new Map();
  for (const row of rows) {
    if (row.attendance_status !== attendanceStatus.present) {
      snapshot.set(row.id, row.attendance_status);
    }
  }
  return snapshot;
}

export function applyMarkAllPresentUndo(
  attendances: attendanceType[],
  snapshot: MarkAllPresentSnapshot,
): attendanceType[] {
  if (snapshot.size === 0) return attendances;
  return attendances.map((row) => {
    const previous = snapshot.get(row.id);
    if (previous == null) return row;
    return { ...row, attendance_status: previous };
  });
}

/** Snapshot rows that will flip from unregistered → absent (for shared undo). */
export function buildMarkUnregisteredAbsentSnapshot(
  rows: Pick<attendanceType, "id" | "attendance_status">[],
): MarkAllPresentSnapshot {
  const snapshot: MarkAllPresentSnapshot = new Map();
  for (const row of rows) {
    if (row.attendance_status === attendanceStatus.unregistered) {
      snapshot.set(row.id, row.attendance_status);
    }
  }
  return snapshot;
}

export function applyMarkUnregisteredAbsent(
  attendances: attendanceType[],
  snapshot: MarkAllPresentSnapshot,
): attendanceType[] {
  if (snapshot.size === 0) return attendances;
  return attendances.map((row) => {
    if (!snapshot.has(row.id)) return row;
    return { ...row, attendance_status: attendanceStatus.absent };
  });
}

export function isMarkAllUndoVisible(
  offeredAt: number | null,
  now: number = Date.now(),
): boolean {
  if (offeredAt == null) return false;
  return now - offeredAt < UNDO_WINDOW_MS;
}
