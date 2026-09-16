import { axiosClient } from "@/lib/api";
import type { zoomAccountType, ZoomAccountUserRow } from "@/types/zoom-account";
import axios from "axios";

type ApiOk<T> = { isError: false; message: string } & T;
type ApiErr = { isError: true; message: string; details?: unknown };

function assertOk<T extends Record<string, unknown>>(
  body: ApiOk<T> | ApiErr,
): asserts body is ApiOk<T> {
  if (body.isError) {
    const detail =
      "details" in body && body.details !== undefined
        ? ` ${JSON.stringify(body.details)}`
        : "";
    throw new Error((body.message || "Request failed") + detail);
  }
}

export async function fetchZoomAccounts(): Promise<zoomAccountType[]> {
  const res = await axiosClient.get(`/zoom/accounts`);
  const body = res.data as ApiOk<{ data: zoomAccountType[] }> | ApiErr;
  assertOk(body);
  return body.data;
}

export async function startZoomOAuth(): Promise<string> {
  const res = await axiosClient.get(`/zoom/oauth/start`);
  const body = res.data as ApiOk<{ authorize_url: string }> | ApiErr;
  assertOk(body);
  return body.authorize_url;
}

export async function reconnectZoomAccount(accountPk: number): Promise<string> {
  const res = await axiosClient.post(`/zoom/accounts/${accountPk}/reconnect`, {});
  const body = res.data as ApiOk<{ authorize_url: string }> | ApiErr;
  assertOk(body);
  return body.authorize_url;
}

export async function disconnectZoomAccount(accountPk: number): Promise<zoomAccountType> {
  const res = await axiosClient.post(`/zoom/accounts/${accountPk}/disconnect`, {});
  const body = res.data as ApiOk<{ data: zoomAccountType }> | ApiErr;
  assertOk(body);
  return body.data;
}

export async function startPersonalZoomOAuth(): Promise<string> {
  const res = await axiosClient.get(`/zoom/oauth/start/personal`);
  const body = res.data as ApiOk<{ authorize_url: string }> | ApiErr;
  assertOk(body);
  return body.authorize_url;
}

export async function reconnectPersonalZoomOAuth(): Promise<string> {
  const res = await axiosClient.post(`/zoom/oauth/personal/reconnect`, {});
  const body = res.data as ApiOk<{ authorize_url: string }> | ApiErr;
  assertOk(body);
  return body.authorize_url;
}

export async function disconnectPersonalZoomOAuth(): Promise<{
  status: string;
  connected: boolean;
}> {
  const res = await axiosClient.post(`/zoom/oauth/personal/disconnect`, {});
  const body =
    res.data as ApiOk<{ data: { status: string; connected: boolean } }> | ApiErr;
  assertOk(body);
  return body.data;
}

export type PersonalZoomStatus = {
  connected: boolean;
  status: string | null;
  authorized_email: string;
  authorized_display_name: string;
};

export async function fetchPersonalZoomStatus(): Promise<PersonalZoomStatus> {
  const res = await axiosClient.get(`/zoom/oauth/personal/status`);
  const body = res.data as ApiOk<{ data: PersonalZoomStatus }> | ApiErr;
  assertOk(body);
  return body.data;
}

export async function fetchZoomAccountUsers(accountPk: number): Promise<ZoomAccountUserRow[]> {
  const res = await axiosClient.get(`/zoom/accounts/${accountPk}/users`);
  const body = res.data as ApiOk<{ data: ZoomAccountUserRow[] }> | ApiErr;
  assertOk(body);
  return body.data;
}

export async function setZoomDefaultHost(
  accountPk: number,
  defaultHostZoomUserId: string,
): Promise<zoomAccountType> {
  const res = await axiosClient.post(`/zoom/accounts/${accountPk}/host`, {
    default_host_zoom_user_id: defaultHostZoomUserId,
  });
  const body = res.data as ApiOk<{ data: zoomAccountType }> | ApiErr;
  assertOk(body);
  return body.data;
}

/** POST /courses/:id/zoom-meeting/schedule */
export async function scheduleCourseZoomMeeting(
  courseId: number,
  body: { force?: boolean } = {},
): Promise<unknown> {
  const res = await axiosClient.post(`/courses/${courseId}/zoom-meeting/schedule`, body ?? {}, {
    timeout: 120_000,
  });
  const data = res.data as ApiOk<{ data: unknown }> | ApiErr;
  assertOk(data);
  return data.data;
}

/** PATCH /courses/:id/zoom-meeting — topic, start_time, duration, timezone (Zoom API subset). */
export async function patchCourseZoomMeeting(
  courseId: number,
  body: {
    topic?: string;
    start_time?: string;
    duration?: number;
    timezone?: string;
  },
): Promise<unknown> {
  const res = await axiosClient.patch(`/courses/${courseId}/zoom-meeting`, body, {
    timeout: 60_000,
  });
  const data = res.data as ApiOk<{ data: unknown }> | ApiErr;
  assertOk(data);
  return data.data;
}

/** POST /courses/:id/zoom-meeting/sync-from-schedule — align Zoom time/topic with first calendar session. */
export async function syncCourseZoomMeetingFromSchedule(
  courseId: number,
  body: { force?: boolean } = {},
): Promise<unknown> {
  const res = await axiosClient.post(
    `/courses/${courseId}/zoom-meeting/sync-from-schedule`,
    body ?? {},
    { timeout: 120_000 },
  );
  const data = res.data as ApiOk<{ data: unknown }> | ApiErr;
  assertOk(data);
  return data.data;
}

/** POST /courses/:id/zoom-meeting/refresh — re-fetch meeting metadata and join URL from Zoom. */
export async function refreshCourseZoomMeeting(courseId: number): Promise<unknown> {
  const res = await axiosClient.post(
    `/courses/${courseId}/zoom-meeting/refresh`,
    {},
    { timeout: 60_000 },
  );
  const data = res.data as ApiOk<{ data: unknown }> | ApiErr;
  assertOk(data);
  return data.data;
}

export type ZoomScheduleConflictItem = {
  id?: string;
  topic?: string;
  start_time?: string;
  duration?: number;
};

/** Axios error from POST schedule when host has another meeting (HTTP 409). */
export function parseZoomScheduleAxiosError(e: unknown): {
  kind: "conflict" | "other";
  message: string;
  conflicts?: ZoomScheduleConflictItem[];
} {
  if (!axios.isAxiosError(e)) {
    return { kind: "other", message: "Could not complete the Zoom meeting request." };
  }
  const status = e.response?.status;
  const data = e.response?.data as Record<string, unknown> | undefined;
  if (status === 409 && data?.message === "zoom_schedule_conflict") {
    return {
      kind: "conflict",
      message: String(data.details ?? "The host has another Zoom meeting at this time."),
      conflicts: Array.isArray(data.conflicts) ? (data.conflicts as ZoomScheduleConflictItem[]) : undefined,
    };
  }
  const details = data?.details;
  return {
    kind: "other",
    message:
      typeof details === "string" ? details : "Could not complete the Zoom meeting request.",
  };
}
