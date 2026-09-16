import type { ChatAttachmentRef, ChatMention } from "@/types/chat";

export enum IssueSource {
  Internal = "INTERNAL",
  ParentComplaint = "PARENT_COMPLAINT",
}

export type IssueStatusBehavior = "NORMAL" | "DONE" | "CANCELLED";

export interface IssueStatus {
  id: number;
  name: string;
  color: string;
  order: number;
  behavior: IssueStatusBehavior;
  is_default: boolean;
}

export interface IssueUserMini {
  id: number | null;
  name: string;
  email: string;
}

export interface Issue {
  id: number;
  title: string;
  description: string;
  source?: IssueSource;
  status: number | IssueStatus;
  assignee: number | IssueUserMini | null;
  created_by: number | IssueUserMini | null;
  related_student: number | IssueUserMini | null;
  related_course: number | Record<string, unknown> | null;
  is_anonymous?: boolean;
  created_at?: string;
  updated_at?: string;
  observers?: IssueUserMini[];
}

export interface IssueComment {
  id: number;
  issue: number;
  author: number | IssueUserMini | null;
  body: string;
  mentions: ChatMention[];
  attachments?: ChatAttachmentRef[];
  created_at: string;
}

export function issueStatusId(issue: Issue): number {
  return typeof issue.status === "number" ? issue.status : issue.status.id;
}

export type IssueTimelineItem =
  | {
      kind: "event";
      id: number;
      event_type: string;
      payload: Record<string, unknown>;
      actor: IssueUserMini | null;
      message?: string;
      created_at: string;
    }
  | {
      kind: "comment";
      id: number;
      body: string;
      actor: IssueUserMini | null;
      attachments?: ChatAttachmentRef[];
      created_at: string;
    };
