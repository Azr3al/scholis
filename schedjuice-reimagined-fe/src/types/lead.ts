import type { ChatMention } from "@/types/chat";

export type LeadBehavior = "NORMAL" | "APPOINTMENT" | "CONVERTED" | "LOST";

export interface LeadStatus {
  id: number;
  name: string;
  color: string;
  order: number;
  behavior: LeadBehavior;
  is_default: boolean;
}

export interface LeadSource {
  id: number;
  name: string;
  is_active: boolean;
}

export interface LeadUserMini {
  id: number;
  name: string;
  email: string;
}

export interface LeadAppointment {
  id: number;
  lead: number;
  scheduled_at: string;
  platform: "ZOOM" | "MEET" | "IN_PERSON" | "PHONE" | "OTHER";
  meeting_link: string;
  consultant: number | null;
  outcome: "SCHEDULED" | "DONE" | "NO_SHOW" | "CANCELLED";
  notes: string;
}

export interface Lead {
  id: number;
  name: string;
  phone: string;
  email: string;
  facebook_link: string;
  interested_in: string;
  note: string;
  source: number | LeadSource;
  status: number | LeadStatus;
  assignee: number | null;
  created_by: number | null;
  converted_user: number | null;
  created_at?: string;
  updated_at?: string;
  appointments?: LeadAppointment[];
  observers?: LeadUserMini[];
}

export interface LeadComment {
  id: number;
  lead: number;
  author: number | LeadUserMini | null;
  body: string;
  mentions: ChatMention[];
  created_at: string;
}

export function leadStatusId(lead: Lead): number {
  return typeof lead.status === "number" ? lead.status : lead.status.id;
}

export function leadSourceId(lead: Lead): number {
  return typeof lead.source === "number" ? lead.source : lead.source.id;
}

export type TimelineItem =
  | {
      kind: "event";
      id: number;
      event_type: string;
      payload: Record<string, unknown>;
      actor: LeadUserMini | null;
      created_at: string;
    }
  | {
      kind: "comment";
      id: number;
      body: string;
      actor: LeadUserMini | null;
      created_at: string;
    };
