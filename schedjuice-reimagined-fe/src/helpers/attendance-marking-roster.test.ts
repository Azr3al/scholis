import { describe, expect, it } from "vitest";
import {
  computeAttendanceMarkingSummary,
  mergeRosterWithLocalEdits,
  toAttendanceType,
} from "@/helpers/attendance-marking-roster";
import { attendanceStatus } from "@/types/attendance";

const baseRow = {
  event_id: 99,
  attendance_note: null,
  is_removed: false,
  user: {
    id: 8,
    name: "Jane",
    alternative_name: null,
    phone_number: null,
  },
};

describe("toAttendanceType", () => {
  it("maps event_id to nested event.id for autosave", () => {
    const row = {
      ...baseRow,
      id: 1,
      attendance_status: attendanceStatus.present,
    };
    const mapped = toAttendanceType(row);
    expect(mapped.event.id).toBe(99);
    expect(mapped.user.id).toBe(8);
  });
});

describe("mergeRosterWithLocalEdits", () => {
  it("preserves dirty local rows and adopts new server rows", () => {
    const local = [
      toAttendanceType({
        ...baseRow,
        id: 1,
        attendance_status: attendanceStatus.present,
        user: { ...baseRow.user, id: 1, name: "Alice" },
      }),
      toAttendanceType({
        ...baseRow,
        id: 2,
        attendance_status: attendanceStatus.unregistered,
        user: { ...baseRow.user, id: 2, name: "Bob" },
      }),
    ];
    const server = [
      toAttendanceType({
        ...baseRow,
        id: 1,
        attendance_status: attendanceStatus.unregistered,
        user: { ...baseRow.user, id: 1, name: "Alice" },
      }),
      toAttendanceType({
        ...baseRow,
        id: 2,
        attendance_status: attendanceStatus.unregistered,
        user: { ...baseRow.user, id: 2, name: "Bob" },
      }),
      toAttendanceType({
        ...baseRow,
        id: 3,
        attendance_status: attendanceStatus.unregistered,
        user: { ...baseRow.user, id: 3, name: "Grace" },
      }),
    ];

    const merged = mergeRosterWithLocalEdits(local, server, [1]);

    expect(merged).toHaveLength(3);
    expect(merged[0]?.attendance_status).toBe(attendanceStatus.present);
    expect(merged[1]?.attendance_status).toBe(attendanceStatus.unregistered);
    expect(merged[2]?.user.name).toBe("Grace");
  });

  it("replaces unchanged rows with server data", () => {
    const local = [
      toAttendanceType({
        ...baseRow,
        id: 1,
        attendance_status: attendanceStatus.present,
      }),
    ];
    const server = [
      toAttendanceType({
        ...baseRow,
        id: 1,
        attendance_status: attendanceStatus.late,
        attendance_note: "Traffic",
      }),
    ];

    const merged = mergeRosterWithLocalEdits(local, server, []);

    expect(merged[0]?.attendance_status).toBe(attendanceStatus.late);
    expect(merged[0]?.attendance_note).toBe("Traffic");
  });
});

describe("computeAttendanceMarkingSummary", () => {
  function row(
    overrides: Partial<{
      id: number;
      attendance_status: attendanceStatus;
      is_removed: boolean;
    }> = {},
  ) {
    return toAttendanceType({
      ...baseRow,
      id: overrides.id ?? 1,
      attendance_status:
        overrides.attendance_status ?? attendanceStatus.unregistered,
      is_removed: overrides.is_removed ?? false,
    });
  }

  it("counts all active students when none are dropped out", () => {
    const summary = computeAttendanceMarkingSummary([
      row({ id: 1, attendance_status: attendanceStatus.present }),
      row({ id: 2, attendance_status: attendanceStatus.late }),
      row({ id: 3, attendance_status: attendanceStatus.absent }),
    ]);

    expect(summary).toEqual({
      presentCount: 2,
      totalCount: 3,
      presentPercent: 66.67,
    });
  });

  it("excludes absent with leave from present count", () => {
    const summary = computeAttendanceMarkingSummary([
      row({ id: 1, attendance_status: attendanceStatus.present }),
      row({ id: 2, attendance_status: attendanceStatus.absentWithLeave }),
    ]);

    expect(summary).toEqual({
      presentCount: 1,
      totalCount: 2,
      presentPercent: 50,
    });
  });

  it("counts all students including removed when present in roster", () => {
    const summary = computeAttendanceMarkingSummary([
      row({ id: 1, attendance_status: attendanceStatus.present }),
      row({ id: 2, attendance_status: attendanceStatus.present }),
      row({
        id: 3,
        attendance_status: attendanceStatus.present,
        is_removed: true,
      }),
      row({
        id: 4,
        attendance_status: attendanceStatus.absent,
        is_removed: true,
      }),
    ]);

    expect(summary).toEqual({
      presentCount: 3,
      totalCount: 4,
      presentPercent: 75,
    });
  });

  it("counts removed students marked present in the numerator", () => {
    const summary = computeAttendanceMarkingSummary([
      row({ id: 1, attendance_status: attendanceStatus.present }),
      row({ id: 2, attendance_status: attendanceStatus.absent }),
      row({
        id: 3,
        attendance_status: attendanceStatus.present,
        is_removed: true,
      }),
    ]);

    expect(summary).toEqual({
      presentCount: 2,
      totalCount: 3,
      presentPercent: 66.67,
    });
  });

  it("returns zero counts for an empty roster", () => {
    expect(computeAttendanceMarkingSummary([])).toEqual({
      presentCount: 0,
      totalCount: 0,
      presentPercent: 0,
    });
  });
});
