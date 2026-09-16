import { axiosClient } from "@/lib/api";

export type AttendanceChangePayload = {
  reason: string;
  changes: Array<{
    field: string;
    from: string | null;
    to: string | null;
  }>;
};

export type AttendanceChangeEvent = {
  id: number;
  user_event_id: number;
  event_type: "self_checkin_corrected" | "self_checkin_backfilled";
  occurred_at: string;
  source?: string | null;
  payload: AttendanceChangePayload;
  actor?: { id: number; name: string } | null;
};

export type SelfCheckinCorrectionInput = {
  checkin_time?: string | null;
  checkout_time?: string | null;
  checkin_image?: File;
  today_activities?: string | null;
  correction_reason: string;
};

export async function patchSelfCheckinCorrection(
  attendanceId: number,
  body: SelfCheckinCorrectionInput,
) {
  const formData = new FormData();
  formData.append("correction_reason", body.correction_reason);
  if (body.checkin_image) {
    formData.append("checkin_image", body.checkin_image);
  }
  if (body.checkin_time) {
    formData.append("checkin_time", body.checkin_time);
  }
  if (body.checkout_time) {
    formData.append("checkout_time", body.checkout_time);
  }
  if (body.today_activities !== undefined) {
    formData.append("today_activities", body.today_activities ?? "");
  }
  const res = await axiosClient.patch(
    `attendances/${attendanceId}/self-correction`,
    formData,
  );
  return res.data;
}

export async function fetchAttendanceCorrections(attendanceId: number) {
  const res = await axiosClient.get(`attendances/${attendanceId}/corrections`);
  return (res.data?.data ?? []) as AttendanceChangeEvent[];
}

export async function bootstrapCheckinHistoryRows(
  courseId: string | number,
  eventIds: number[],
) {
  const res = await axiosClient.post(
    `courses/${courseId}/checkin-history/bootstrap`,
    { event_ids: eventIds },
  );
  return res.data;
}
