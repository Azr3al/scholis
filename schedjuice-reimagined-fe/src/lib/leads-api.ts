import { encodeArrayToBase64 } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import type {
  Lead,
  LeadStatus,
  LeadSource,
  LeadAppointment,
  LeadComment,
  TimelineItem,
} from "@/types/lead";
import type { ChatMention } from "@/types/chat";

type Envelope<T> = { isError: boolean; message: string; data: T };

export async function fetchLeadStatuses(): Promise<LeadStatus[]> {
  const res = await axiosClient.get<Envelope<LeadStatus[]>>("lead-statuses");
  return res.data.data;
}

export async function fetchLeadSources(): Promise<LeadSource[]> {
  const res = await axiosClient.get<Envelope<LeadSource[]>>("lead-sources");
  return res.data.data;
}

export async function fetchLeads(): Promise<Lead[]> {
  const expand = encodeArrayToBase64([
    "source",
    "status",
    "assignee",
    "appointments",
    "observers",
  ]);
  const res = await axiosClient.get<Envelope<Lead[]>>(`leads?expand=${expand}&size=500`);
  return res.data.data;
}

export interface CreateLeadInput {
  name: string;
  source: number;
  status?: number;
  phone?: string;
  email?: string;
  facebook_link?: string;
  interested_in?: string;
  note?: string;
}

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const res = await axiosClient.post<Envelope<Lead>>("leads", input);
  return res.data.data;
}

export interface AppointmentInput {
  scheduled_at: string;
  platform: LeadAppointment["platform"];
  consultant?: number | null;
  meeting_link?: string;
  notes?: string;
}

export interface StudentInput {
  name: string;
  email: string;
  phone?: string;
}

export async function moveLead(
  leadId: number,
  statusId: number,
  extra?: { appointment?: AppointmentInput; student?: StudentInput },
): Promise<Lead> {
  const res = await axiosClient.post<Envelope<Lead>>(`leads/${leadId}/move`, {
    status: statusId,
    ...extra,
  });
  return res.data.data;
}

export async function updateAppointment(
  appointmentId: number,
  input: Partial<AppointmentInput & { outcome?: LeadAppointment["outcome"] }>,
): Promise<LeadAppointment> {
  const res = await axiosClient.patch<Envelope<LeadAppointment>>(
    `leads/appointments/${appointmentId}`,
    input,
  );
  return res.data.data;
}

export async function convertLead(
  leadId: number,
  student: StudentInput,
): Promise<{ lead: Lead; student_id: number }> {
  const res = await axiosClient.post<Envelope<{ lead: Lead; student_id: number }>>(
    `leads/${leadId}/convert`,
    student,
  );
  return res.data.data;
}

export async function fetchTimeline(leadId: number): Promise<TimelineItem[]> {
  const res = await axiosClient.get<Envelope<TimelineItem[]>>(
    `leads/${leadId}/timeline`,
  );
  return res.data.data;
}

export interface PostLeadCommentInput {
  body: string;
  mentions?: ChatMention[];
}

export async function postLeadComment(
  leadId: number,
  input: PostLeadCommentInput,
): Promise<LeadComment> {
  const res = await axiosClient.post<Envelope<LeadComment>>(
    `leads/${leadId}/comments`,
    input,
  );
  return res.data.data;
}

export interface LeadMentionCandidate {
  id: number;
  name: string;
  email: string;
}

export async function fetchLeadMentionCandidates(
  q?: string,
): Promise<LeadMentionCandidate[]> {
  const query = q?.trim();
  const res = await axiosClient.get<Envelope<LeadMentionCandidate[]>>(
    `leads/mention-candidates${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );
  return res.data.data;
}

export async function addLeadObserver(leadId: number, userId: number): Promise<Lead> {
  const res = await axiosClient.post<Envelope<Lead>>(`leads/${leadId}/observers`, {
    user_id: userId,
  });
  return res.data.data;
}

export async function removeLeadObserver(leadId: number, userId: number): Promise<Lead> {
  const res = await axiosClient.delete<Envelope<Lead>>(
    `leads/${leadId}/observers/${userId}`,
  );
  return res.data.data;
}

export async function createStatus(input: Partial<LeadStatus>): Promise<LeadStatus> {
  const res = await axiosClient.post<Envelope<LeadStatus>>("lead-statuses", input);
  return res.data.data;
}

export async function updateStatus(
  id: number,
  input: Partial<LeadStatus>,
): Promise<LeadStatus> {
  const res = await axiosClient.put<Envelope<LeadStatus>>(`lead-statuses/${id}`, input);
  return res.data.data;
}

export async function deleteStatus(id: number): Promise<void> {
  await axiosClient.delete(`lead-statuses/${id}`);
}

export async function createSource(input: Partial<LeadSource>): Promise<LeadSource> {
  const res = await axiosClient.post<Envelope<LeadSource>>("lead-sources", input);
  return res.data.data;
}

export async function updateSource(
  id: number,
  input: Partial<LeadSource>,
): Promise<LeadSource> {
  const res = await axiosClient.put<Envelope<LeadSource>>(`lead-sources/${id}`, input);
  return res.data.data;
}

export async function deleteSource(id: number): Promise<void> {
  await axiosClient.delete(`lead-sources/${id}`);
}

export async function findDuplicateLeads(params: {
  phone?: string;
  email?: string;
  facebook_link?: string;
}): Promise<Lead[]> {
  const filter_params = Object.entries(params)
    .filter(([, value]) => value)
    .map(([field_name, value]) => ({
      field_name,
      value,
      operator: "iexact",
    }));
  if (!filter_params.length) {
    return [];
  }
  const res = await axiosClient.post<Envelope<Lead[]>>("leads/search", {
    filter_params,
  });
  return res.data.data;
}
