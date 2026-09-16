"use client";

import { useMemo } from "react";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { groupLeadsByStatus } from "@/lib/leads-board";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";
import { leadSourceId } from "@/types/lead";
import { LeadCardContent } from "./lead-card";

export function LeadsBoard({
  statuses,
  leads,
  sourceById,
  onOpenLead,
  onChangeStatus,
}: {
  statuses: LeadStatus[];
  leads: Lead[];
  sourceById: Record<number, LeadSource>;
  onOpenLead: (lead: Lead) => void;
  onChangeStatus: (lead: Lead, status: LeadStatus) => void;
}) {
  const itemsByColumn = useMemo(
    () => groupLeadsByStatus(leads, statuses),
    [leads, statuses],
  );

  const statusById = useMemo(() => {
    const map: Record<number, LeadStatus> = {};
    for (const status of statuses) map[status.id] = status;
    return map;
  }, [statuses]);

  function resolveSource(lead: Lead): LeadSource | undefined {
    return typeof lead.source === "object"
      ? lead.source
      : sourceById[leadSourceId(lead)];
  }

  return (
    <KanbanBoard
      columns={statuses}
      itemsByColumn={itemsByColumn}
      getItemId={(lead) => lead.id}
      renderCard={(lead, { overlay }) => (
        <LeadCardContent
          lead={lead}
          source={resolveSource(lead)}
          overlay={overlay}
        />
      )}
      onOpenItem={onOpenLead}
      onMoveItem={(lead, column) => {
        const status = statusById[column.id];
        if (status) onChangeStatus(lead, status);
      }}
    />
  );
}
