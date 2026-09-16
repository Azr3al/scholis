import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  sortAttendanceRows,
  type AttendanceMarkingSortState,
} from "@/helpers/attendance-marking-sort";
import { toAttendanceType } from "@/helpers/attendance-marking-roster";
import { attendanceStatus } from "@/types/attendance";

const baseRow = {
  event_id: 1,
  attendance_note: null,
  is_removed: false,
  user: {
    id: 1,
    name: "Jane",
    alternative_name: null as string | null,
    phone_number: null as string | null,
  },
};

function row(
  overrides: {
    id: number;
    name: string;
    is_removed?: boolean;
    alternative_name?: string | null;
    phone_number?: string | null;
  },
) {
  return toAttendanceType({
    ...baseRow,
    id: overrides.id,
    attendance_status: attendanceStatus.unregistered,
    is_removed: overrides.is_removed ?? false,
    user: {
      ...baseRow.user,
      id: overrides.id,
      name: overrides.name,
      alternative_name:
        overrides.alternative_name !== undefined
          ? overrides.alternative_name
          : baseRow.user.alternative_name,
      phone_number:
        overrides.phone_number !== undefined
          ? overrides.phone_number
          : baseRow.user.phone_number,
    },
  });
}

describe("sortAttendanceRows", () => {
  it("returns empty array for empty roster", () => {
    expect(sortAttendanceRows([], DEFAULT_SORT)).toEqual([]);
  });

  it("sorts by student name A→Z by default", () => {
    const rows = [
      row({ id: 1, name: "Charlie" }),
      row({ id: 2, name: "alice" }),
      row({ id: 3, name: "Bob" }),
    ];
    const sorted = sortAttendanceRows(rows, DEFAULT_SORT);
    expect(sorted.map((r) => r.user.name)).toEqual(["alice", "Bob", "Charlie"]);
  });

  it("sorts student name Z→A when direction is desc", () => {
    const rows = [
      row({ id: 1, name: "Charlie" }),
      row({ id: 2, name: "alice" }),
      row({ id: 3, name: "Bob" }),
    ];
    const sort: AttendanceMarkingSortState = { column: "student", direction: "desc" };
    const sorted = sortAttendanceRows(rows, sort);
    expect(sorted.map((r) => r.user.name)).toEqual(["Charlie", "Bob", "alice"]);
  });

  it("sorts alt name with non-blank before blank", () => {
    const rows = [
      row({ id: 1, name: "A", alternative_name: null }),
      row({ id: 2, name: "B", alternative_name: "Zeta" }),
      row({ id: 3, name: "C", alternative_name: "Alpha" }),
      row({ id: 4, name: "D", alternative_name: "   " }),
    ];
    const sort: AttendanceMarkingSortState = { column: "altName", direction: "asc" };
    const sorted = sortAttendanceRows(rows, sort);
    expect(sorted.map((r) => r.id)).toEqual([3, 2, 1, 4]);
  });

  it("sorts phone with non-blank before blank", () => {
    const rows = [
      row({ id: 1, name: "A", phone_number: "099" }),
      row({ id: 2, name: "B", phone_number: null }),
      row({ id: 3, name: "C", phone_number: "011" }),
    ];
    const sort: AttendanceMarkingSortState = { column: "phone", direction: "asc" };
    const sorted = sortAttendanceRows(rows, sort);
    expect(sorted.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it("sorts enrollment active before dropped, tie-break by name", () => {
    const rows = [
      row({ id: 1, name: "Zara", is_removed: true }),
      row({ id: 2, name: "Amy", is_removed: false }),
      row({ id: 3, name: "Ben", is_removed: true }),
      row({ id: 4, name: "Cal", is_removed: false }),
    ];
    const sort: AttendanceMarkingSortState = { column: "enrollment", direction: "asc" };
    const sorted = sortAttendanceRows(rows, sort);
    expect(sorted.map((r) => r.user.name)).toEqual(["Amy", "Cal", "Ben", "Zara"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ id: 1, name: "B" }),
      row({ id: 2, name: "A" }),
    ];
    const copy = [...rows];
    sortAttendanceRows(rows, DEFAULT_SORT);
    expect(rows).toEqual(copy);
  });
});
