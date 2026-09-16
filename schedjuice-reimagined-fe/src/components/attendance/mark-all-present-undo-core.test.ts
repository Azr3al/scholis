import { describe, it, expect } from "vitest";
import { attendanceStatus, type attendanceType } from "@/types/attendance";
import {
  applyMarkAllPresentUndo,
  applyMarkUnregisteredAbsent,
  buildMarkAllPresentSnapshot,
  buildMarkUnregisteredAbsentSnapshot,
  isMarkAllUndoVisible,
  type MarkAllPresentSnapshot,
} from "./mark-all-present-undo-core";
import { UNDO_WINDOW_MS } from "@/components/record/inline/undo-core";

function row(
  id: number,
  status: attendanceStatus,
): Pick<attendanceType, "id" | "attendance_status"> {
  return { id, attendance_status: status };
}

describe("mark-all-present-undo-core", () => {
  it("buildMarkAllPresentSnapshot captures only non-present rows", () => {
    const rows = [
      row(1, attendanceStatus.present),
      row(2, attendanceStatus.absent),
      row(3, attendanceStatus.late),
    ];
    const snapshot = buildMarkAllPresentSnapshot(rows);
    expect(snapshot.get(1)).toBeUndefined();
    expect(snapshot.get(2)).toBe(attendanceStatus.absent);
    expect(snapshot.get(3)).toBe(attendanceStatus.late);
    expect(snapshot.size).toBe(2);
  });

  it("buildMarkAllPresentSnapshot returns empty map when all present", () => {
    const rows = [row(1, attendanceStatus.present), row(2, attendanceStatus.present)];
    expect(buildMarkAllPresentSnapshot(rows).size).toBe(0);
  });

  it("applyMarkAllPresentUndo restores snapshotted rows only", () => {
    const attendances = [
      row(1, attendanceStatus.present),
      row(2, attendanceStatus.present),
      row(3, attendanceStatus.present),
    ] as attendanceType[];
    const snapshot: MarkAllPresentSnapshot = new Map([
      [2, attendanceStatus.absent],
      [3, attendanceStatus.late],
    ]);
    const next = applyMarkAllPresentUndo(attendances, snapshot);
    expect(next[0].attendance_status).toBe(attendanceStatus.present);
    expect(next[1].attendance_status).toBe(attendanceStatus.absent);
    expect(next[2].attendance_status).toBe(attendanceStatus.late);
  });

  it("isMarkAllUndoVisible respects UNDO_WINDOW_MS", () => {
    expect(isMarkAllUndoVisible(1000, 1000 + UNDO_WINDOW_MS - 1)).toBe(true);
    expect(isMarkAllUndoVisible(1000, 1000 + UNDO_WINDOW_MS)).toBe(false);
    expect(isMarkAllUndoVisible(null, 5000)).toBe(false);
  });

  it("buildMarkUnregisteredAbsentSnapshot captures only unregistered rows", () => {
    const rows = [
      row(1, attendanceStatus.present),
      row(2, attendanceStatus.unregistered),
      row(3, attendanceStatus.absent),
      row(4, attendanceStatus.unregistered),
    ];
    const snapshot = buildMarkUnregisteredAbsentSnapshot(rows);
    expect(snapshot.size).toBe(2);
    expect(snapshot.get(2)).toBe(attendanceStatus.unregistered);
    expect(snapshot.get(4)).toBe(attendanceStatus.unregistered);
    expect(snapshot.get(1)).toBeUndefined();
    expect(snapshot.get(3)).toBeUndefined();
  });

  it("applyMarkUnregisteredAbsent flips snapshotted rows to absent", () => {
    const attendances = [
      row(1, attendanceStatus.present),
      row(2, attendanceStatus.unregistered),
      row(3, attendanceStatus.late),
    ] as attendanceType[];
    const snapshot = buildMarkUnregisteredAbsentSnapshot(attendances);
    const next = applyMarkUnregisteredAbsent(attendances, snapshot);
    expect(next[0].attendance_status).toBe(attendanceStatus.present);
    expect(next[1].attendance_status).toBe(attendanceStatus.absent);
    expect(next[2].attendance_status).toBe(attendanceStatus.late);
  });

  it("applyMarkAllPresentUndo restores unregistered-as-absent bulk flip", () => {
    const after = [
      row(1, attendanceStatus.present),
      row(2, attendanceStatus.absent),
    ] as attendanceType[];
    const snapshot: MarkAllPresentSnapshot = new Map([
      [2, attendanceStatus.unregistered],
    ]);
    const restored = applyMarkAllPresentUndo(after, snapshot);
    expect(restored[1].attendance_status).toBe(attendanceStatus.unregistered);
  });
});
