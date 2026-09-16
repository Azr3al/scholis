import { encodeArrayToBase64 } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import type {
  Issue,
  IssueComment,
  IssueSource,
  IssueStatus,
  IssueTimelineItem,
} from "@/types/issue";
import type { ChatAttachmentRef, ChatMention } from "@/types/chat";

type Envelope<T> = { isError: boolean; message: string; data: T };

export async function fetchIssueStatuses(): Promise<IssueStatus[]> {
  const res = await axiosClient.get<Envelope<IssueStatus[]>>("issue-statuses");
  return res.data.data;
}

export async function fetchIssue(issueId: number): Promise<Issue> {
  const expand = encodeArrayToBase64([
    "status",
    "assignee",
    "created_by",
    "related_student",
    "related_course",
    "observers",
  ]);
  const res = await axiosClient.get<Envelope<Issue>>(
    `issues/${issueId}?expand=${expand}`,
  );
  return res.data.data;
}

export async function fetchIssues(options?: { source?: IssueSource }): Promise<Issue[]> {
  const expand = encodeArrayToBase64([
    "status",
    "assignee",
    "created_by",
    "related_student",
    "related_course",
    "observers",
  ]);
  const params = new URLSearchParams({ expand, size: "500" });
  if (options?.source) {
    params.set("source", options.source);
  }
  const res = await axiosClient.get<Envelope<Issue[]>>(`issues?${params.toString()}`);
  return res.data.data;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  status?: number;
  assignee?: number | null;
  related_student?: number | null;
  related_course?: number | null;
}

export async function createIssue(input: CreateIssueInput): Promise<Issue> {
  const res = await axiosClient.post<Envelope<Issue>>("issues", input);
  return res.data.data;
}

export async function createParentComplaint(input: {
  body?: string;
  attachments?: ChatAttachmentRef[];
  is_anonymous?: boolean;
}): Promise<Issue> {
  const res = await axiosClient.post<Envelope<Issue>>("issues", input);
  return res.data.data;
}

export async function moveIssue(issueId: number, statusId: number): Promise<Issue> {
  const res = await axiosClient.post<Envelope<Issue>>(`issues/${issueId}/move`, {
    status: statusId,
  });
  return res.data.data;
}

export interface UpdateIssueInput {
  assignee?: number | null;
  related_student?: number | null;
  related_course?: number | null;
}

export async function updateIssue(
  issueId: number,
  input: UpdateIssueInput,
): Promise<Issue> {
  const res = await axiosClient.put<Envelope<Issue>>(`issues/${issueId}`, input);
  return res.data.data;
}

export async function fetchIssueTimeline(issueId: number): Promise<IssueTimelineItem[]> {
  const res = await axiosClient.get<Envelope<IssueTimelineItem[]>>(
    `issues/${issueId}/timeline`,
  );
  return res.data.data;
}

export interface PostIssueCommentInput {
  body: string;
  mentions?: ChatMention[];
}

export async function postIssueComment(
  issueId: number,
  input: PostIssueCommentInput,
): Promise<IssueComment> {
  const res = await axiosClient.post<Envelope<IssueComment>>(
    `issues/${issueId}/comments`,
    input,
  );
  return res.data.data;
}

export async function postComplaintComment(
  issueId: number,
  input: { body?: string; attachments?: ChatAttachmentRef[] },
): Promise<IssueComment> {
  const res = await axiosClient.post<Envelope<IssueComment>>(
    `issues/${issueId}/comments`,
    input,
  );
  return res.data.data;
}

export interface IssueMentionCandidate {
  id: number;
  name: string;
  email: string;
}

export async function fetchIssueMentionCandidates(
  q?: string,
): Promise<IssueMentionCandidate[]> {
  const query = q?.trim();
  const res = await axiosClient.get<Envelope<IssueMentionCandidate[]>>(
    `issues/mention-candidates${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );
  return res.data.data;
}

export async function addIssueObserver(issueId: number, userId: number): Promise<Issue> {
  const res = await axiosClient.post<Envelope<Issue>>(`issues/${issueId}/observers`, {
    user_id: userId,
  });
  return res.data.data;
}

export async function removeIssueObserver(issueId: number, userId: number): Promise<Issue> {
  const res = await axiosClient.delete<Envelope<Issue>>(
    `issues/${issueId}/observers/${userId}`,
  );
  return res.data.data;
}

export async function createIssueStatus(input: Partial<IssueStatus>): Promise<IssueStatus> {
  const res = await axiosClient.post<Envelope<IssueStatus>>("issue-statuses", input);
  return res.data.data;
}

export async function updateIssueStatus(
  id: number,
  input: Partial<IssueStatus>,
): Promise<IssueStatus> {
  const res = await axiosClient.put<Envelope<IssueStatus>>(`issue-statuses/${id}`, input);
  return res.data.data;
}

export async function deleteIssueStatus(id: number): Promise<void> {
  await axiosClient.delete(`issue-statuses/${id}`);
}
