import { axiosClient } from "@/lib/api";
import type { AttendanceMarkingBootstrap, MarkingRosterRow } from "@/types/attendance";

export async function getAttendanceMarkingBootstrap(
  courseId: string | number,
  eventId?: number | null,
  includeRemovedStudents = false,
): Promise<AttendanceMarkingBootstrap> {
  const params: Record<string, string | number> = {};
  if (eventId != null) params.event_id = eventId;
  if (includeRemovedStudents) params.include_removed_students = "true";
  const res = await axiosClient.get<{ data: AttendanceMarkingBootstrap }>(
    `courses/${courseId}/attendance-marking`,
    { params: Object.keys(params).length ? params : undefined },
  );
  return res.data.data;
}

export async function getMarkingRoster(
  eventId: number,
  includeRemovedStudents = false,
): Promise<{
  event_id: number;
  roster: MarkingRosterRow[];
}> {
  const res = await axiosClient.get<{
    data: { event_id: number; roster: MarkingRosterRow[] };
  }>(`attendances/marking-roster/${eventId}`, {
    params: includeRemovedStudents
      ? { include_removed_students: "true" }
      : undefined,
  });
  return res.data.data;
}
