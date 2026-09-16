import { encodeArrayToBase64 } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";

import type { LeaveRequest } from "../_types/leave-requests";

type ApiEnvelope<T> = { isError: boolean; message: string; data: T };

function unwrap<T>(response: { data: ApiEnvelope<T> }): T {
  return response.data.data;
}

const LEAVE_EXPAND = ["student", "reviewed_by", "attachment"];

export type ListLeaveRequestsArgs = {
  status?: string;
  student_id?: number;
  start_date_gte?: string;
  end_date_lte?: string;
  page?: number;
  size?: number;
};

export async function listLeaveRequests(
  args: ListLeaveRequestsArgs = {},
): Promise<{ rows: LeaveRequest[]; total: number }> {
  const params = new URLSearchParams();
  params.set("page", String(args.page ?? 1));
  params.set("size", String(args.size ?? 100));
  params.set("expand", encodeArrayToBase64(LEAVE_EXPAND));
  if (args.status) params.set("status", args.status);
  if (args.student_id != null) params.set("student_id", String(args.student_id));
  if (args.start_date_gte) params.set("start_date_gte", args.start_date_gte);
  if (args.end_date_lte) params.set("end_date_lte", args.end_date_lte);

  const response = await axiosClient.get<ApiEnvelope<LeaveRequest[]>>(
    `leave-requests?${params.toString()}`,
  );
  const rows = unwrap(response);
  const total = Number(response.headers["x-total-count"] ?? rows.length);
  return { rows, total };
}

export async function fetchLeaveRequest(id: number): Promise<LeaveRequest> {
  const expand = encodeArrayToBase64(LEAVE_EXPAND);
  const response = await axiosClient.get<ApiEnvelope<LeaveRequest>>(
    `leave-requests/${id}?expand=${expand}`,
  );
  return unwrap(response);
}

export async function approveLeaveRequest(id: number): Promise<LeaveRequest> {
  const response = await axiosClient.post<ApiEnvelope<LeaveRequest>>(
    `leave-requests/${id}/approve`,
  );
  return unwrap(response);
}

export async function denyLeaveRequest(
  id: number,
  denial_reason: string,
): Promise<LeaveRequest> {
  const response = await axiosClient.post<ApiEnvelope<LeaveRequest>>(
    `leave-requests/${id}/deny`,
    { denial_reason },
  );
  return unwrap(response);
}

export const leaveRequestsKeys = {
  all: ["leave-requests"] as const,
  lists: () => [...leaveRequestsKeys.all, "list"] as const,
  list: (args: ListLeaveRequestsArgs) =>
    [...leaveRequestsKeys.lists(), args] as const,
  detail: (id: number) => [...leaveRequestsKeys.all, "detail", id] as const,
};
