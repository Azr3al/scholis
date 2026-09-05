import { groupByColumnId } from "@/lib/kanban-board";
import type { Lead, LeadStatus } from "@/types/lead";
import { leadStatusId } from "@/types/lead";

export function groupLeadsByStatus(
  leads: Lead[],
  statuses: LeadStatus[],
): Record<number, Lead[]> {
  const grouped = groupByColumnId(statuses, leads, leadStatusId);
  return Object.fromEntries(grouped) as Record<number, Lead[]>;
}

export function applyOptimisticMove(
  leads: Lead[],
  leadId: number,
  targetStatusId: number,
): Lead[] {
  return leads.map((lead) =>
    lead.id === leadId
      ? {
          ...lead,
          status:
            typeof lead.status === "number"
              ? targetStatusId
              : { ...lead.status, id: targetStatusId },
        }
      : lead,
  );
}

export type StatusChangeAction =
  | { kind: "noop" }
  | { kind: "appointment" }
  | { kind: "convert" }
  | { kind: "move" };

export function resolveStatusChange(
  lead: Lead,
  target: LeadStatus,
): StatusChangeAction {
  if (leadStatusId(lead) === target.id) return { kind: "noop" };
  if (target.behavior === "APPOINTMENT") return { kind: "appointment" };
  if (target.behavior === "CONVERTED") return { kind: "convert" };
  return { kind: "move" };
}
