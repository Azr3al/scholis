import { format } from "date-fns";

import { nextLeadAppointment } from "@/components/leads/appointment-platform-display";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";
import { leadSourceId } from "@/types/lead";

export type LeadTableField =
  | "name"
  | "status"
  | "source"
  | "interested_in"
  | "phone"
  | "email"
  | "assignee"
  | "next_appointment"
  | "created_at";

export interface LeadTableColumn {
  field: LeadTableField;
  title: string;
  width: number;
}

export const LEAD_TABLE_COLUMNS: LeadTableColumn[] = [
  { field: "name", title: "Name", width: 200 },
  { field: "status", title: "Status", width: 160 },
  { field: "source", title: "Source", width: 140 },
  { field: "interested_in", title: "Interested in", width: 200 },
  { field: "phone", title: "Phone", width: 140 },
  { field: "email", title: "Email", width: 220 },
  { field: "assignee", title: "Assignee", width: 160 },
  { field: "next_appointment", title: "Next appointment", width: 180 },
  { field: "created_at", title: "Created", width: 140 },
];

export interface LeadTextContext {
  sourceById: Record<number, LeadSource>;
  statusById: Record<number, LeadStatus>;
}

function assigneeName(lead: Lead): string {
  const assignee = lead.assignee as unknown;
  if (assignee && typeof assignee === "object" && "name" in assignee) {
    return String((assignee as { name: unknown }).name ?? "");
  }
  return "";
}

export function leadStatusName(lead: Lead, ctx: LeadTextContext): string {
  if (typeof lead.status === "object") return lead.status.name;
  return ctx.statusById[lead.status]?.name ?? "";
}

export function leadStatusColor(lead: Lead, ctx: LeadTextContext): string {
  if (typeof lead.status === "object") return lead.status.color;
  return ctx.statusById[lead.status]?.color ?? "#94a3b8";
}

export function leadFieldText(
  lead: Lead,
  field: LeadTableField,
  ctx: LeadTextContext,
): string {
  switch (field) {
    case "name":
      return lead.name ?? "";
    case "status":
      return leadStatusName(lead, ctx);
    case "source": {
      const name =
        typeof lead.source === "object"
          ? lead.source.name
          : ctx.sourceById[leadSourceId(lead)]?.name;
      return name ?? "";
    }
    case "interested_in":
      return lead.interested_in ?? "";
    case "phone":
      return lead.phone ?? "";
    case "email":
      return lead.email ?? "";
    case "assignee":
      return assigneeName(lead) || "—";
    case "next_appointment": {
      const appt = nextLeadAppointment(lead.appointments);
      return appt
        ? format(new Date(appt.scheduled_at), "d MMM yyyy, h:mm a")
        : "—";
    }
    case "created_at":
      return lead.created_at
        ? format(new Date(lead.created_at), "d MMM yyyy")
        : "—";
    default:
      return "";
  }
}

export function filterLeads(leads: Lead[], search: string): Lead[] {
  const q = search.trim().toLowerCase();
  if (!q) return leads;
  return leads.filter((lead) =>
    [lead.name, lead.phone, lead.email].some((v) =>
      (v ?? "").toLowerCase().includes(q),
    ),
  );
}
