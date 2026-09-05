import { describe, expect, it } from "vitest";
import { attendanceStatus, type attendanceType } from "@/types/attendance";
import { buildAttendanceSavePayload } from "./attendance-save-payload";

const baseAttendance = (id: number): attendanceType => ({
  id,
  user: {
    id: id * 10,
    name: `Student ${id}`,
    email: `student${id}@example.com`,
    alternative_name: null,
    phone_number: null,
  } as unknown as attendanceType["user"],
  event: { id: 99, date: "2026-06-08", course_id: 1 } as attendanceType["event"],
  attendance_status: attendanceStatus.unregistered,
  attendance_note: null,
  checkin_time: null,
  checkout_time: null,
  checkin_image: null,
  is_extra_class: false,
  today_activities: null,
});

describe("buildAttendanceSavePayload", () => {
  it("returns only dirty rows in save shape", () => {
    const rows = [baseAttendance(1), baseAttendance(2), baseAttendance(3)];
    rows[0].attendance_status = attendanceStatus.present;
    rows[2].attendance_note = "Doctor visit";

    const payload = buildAttendanceSavePayload(rows, [1, 3]);

    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual({
      id: 1,
      user: 10,
      event: 99,
      attendance_status: attendanceStatus.present,
      attendance_note: null,
    });
    expect(payload[1]).toEqual({
      id: 3,
      user: 30,
      event: 99,
      attendance_status: attendanceStatus.unregistered,
      attendance_note: "Doctor visit",
    });
  });

  it("returns an empty array when nothing is dirty", () => {
    const payload = buildAttendanceSavePayload([baseAttendance(1)], []);
    expect(payload).toEqual([]);
  });

  it("includes note from synchronously updated refs before render", () => {
    const rows = [baseAttendance(1)];
    rows[0].attendance_status = attendanceStatus.present;
    const attendancesRef = { current: rows };
    const dirtyIdsRef = { current: [] as number[] };

    const note = "Doctor visit";
    attendancesRef.current = [{ ...rows[0], attendance_note: note }];
    dirtyIdsRef.current = [1];

    const payload = buildAttendanceSavePayload(
      attendancesRef.current,
      dirtyIdsRef.current,
    );

    expect(payload).toEqual([
      {
        id: 1,
        user: 10,
        event: 99,
        attendance_status: attendanceStatus.present,
        attendance_note: note,
      },
    ]);
  });

  it("handles raw marking roster rows with event_id instead of event.id", () => {
    const rawRow = {
      id: 1,
      attendance_status: attendanceStatus.present,
      attendance_note: null,
      is_removed: false,
      event_id: 99,
      user: {
        id: 10,
        name: "Student 1",
        alternative_name: null,
        phone_number: null,
      },
    };

    const payload = buildAttendanceSavePayload([rawRow as unknown as attendanceType], [1]);

    expect(payload).toEqual([
      {
        id: 1,
        user: 10,
        event: 99,
        attendance_status: attendanceStatus.present,
        attendance_note: null,
      },
    ]);
  });
});
