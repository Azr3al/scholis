import { getCookie } from "cookies-next";
import {
  ensureAttendanceRow,
  sameAttendanceRowId,
} from "@/helpers/attendance-marking-roster";
import type { attendanceType } from "@/types/attendance";

export type AttendanceSavePayload = {
  id: number;
  user: number;
  event: number;
  attendance_status: attendanceType["attendance_status"];
  attendance_note: attendanceType["attendance_note"];
};

function resolveUserId(row: attendanceType): number {
  const userId = row.user?.id;
  if (userId == null) {
    throw new Error(`Missing user id on attendance row ${row.id}`);
  }
  return Number(userId);
}

function resolveEventId(row: attendanceType): number {
  const eventId = row.event?.id;
  if (eventId == null) {
    throw new Error(`Missing event id on attendance row ${row.id}`);
  }
  return Number(eventId);
}

export function buildAttendanceSavePayload(
  attendances: attendanceType[],
  dirtyIds: number[],
): AttendanceSavePayload[] {
  return attendances
    .filter((row) =>
      dirtyIds.some((dirtyId) => sameAttendanceRowId(dirtyId, row.id)),
    )
    .map((row) => {
      const normalized = ensureAttendanceRow(row);
      return {
        id: normalized.id,
        user: resolveUserId(normalized),
        event: resolveEventId(normalized),
        attendance_status: normalized.attendance_status,
        attendance_note: normalized.attendance_note,
      };
    });
}

export function sendAttendanceSaveKeepalive(
  payload: AttendanceSavePayload[],
): void {
  if (payload.length === 0 || typeof window === "undefined") return;

  const baseURL = process.env.NEXT_PUBLIC_BASE_API_URL;
  if (!baseURL) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const access = getCookie("access");
  const schema = getCookie("schema");
  if (access) headers.Authorization = `Bearer ${access}`;
  if (schema) headers["X-Tenant"] = String(schema);

  void fetch(`${baseURL}/attendances`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
    keepalive: true,
  });
}
