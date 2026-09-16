import { encodeArrayToBase64 } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import type {
  LogEntry,
  LogTimelineEvent,
  ReportType,
  ReportTypeField,
} from "@/types/user-log";

type Envelope<T> = { isError: boolean; message: string; data: T };

export async function fetchReportTypes(): Promise<ReportType[]> {
  const expand = encodeArrayToBase64(["fields"]);
  const res = await axiosClient.get<Envelope<ReportType[]>>(
    `report-types?expand=${expand}&size=500`,
  );
  return res.data.data;
}

export async function createReportType(
  input: Partial<ReportType>,
): Promise<ReportType> {
  const res = await axiosClient.post<Envelope<ReportType>>("report-types", input);
  return res.data.data;
}

export async function updateReportType(
  id: number,
  input: Partial<ReportType>,
): Promise<ReportType> {
  const res = await axiosClient.put<Envelope<ReportType>>(
    `report-types/${id}`,
    input,
  );
  return res.data.data;
}

export async function deleteReportType(id: number): Promise<void> {
  await axiosClient.delete(`report-types/${id}`);
}

export async function replaceReportTypeFields(
  id: number,
  fields: Array<Partial<ReportTypeField>>,
): Promise<ReportTypeField[]> {
  const res = await axiosClient.put<Envelope<ReportTypeField[]>>(
    `report-types/${id}/fields`,
    { fields },
  );
  return res.data.data;
}

export async function fetchUserLogs(
  userId: number,
  reportTypeId?: number,
): Promise<LogEntry[]> {
  const expand = encodeArrayToBase64(["report_type", "author"]);
  const q = reportTypeId ? `&report_type=${reportTypeId}` : "";
  const res = await axiosClient.get<Envelope<LogEntry[]>>(
    `users/${userId}/logs?expand=${expand}${q}`,
  );
  return res.data.data;
}

interface CreateLogInput {
  report_type: number;
  title: string;
  body?: string;
  field_values?: Record<string, unknown>;
}

export async function createUserLog(
  userId: number,
  input: CreateLogInput,
): Promise<LogEntry> {
  const res = await axiosClient.post<Envelope<LogEntry>>(
    `users/${userId}/logs`,
    input,
  );
  return res.data.data;
}

export async function fetchLogTimeline(
  entryId: number,
): Promise<LogTimelineEvent[]> {
  const res = await axiosClient.get<Envelope<LogTimelineEvent[]>>(
    `logs/${entryId}/timeline`,
  );
  return res.data.data;
}
