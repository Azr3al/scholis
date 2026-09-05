"use client";
import { Button, buttonVariants } from "@/components/primitives";
import { ToggleGroup, ToggleGroupItem } from "@/components/misc/toggle-group";

import "@glideapps/glide-data-grid/dist/index.css";

import { useEffect, useMemo, useState } from "react";
import { ViewGrid as LayoutGrid, Plus, Settings, Table2Columns as Table2 } from "iconoir-react";
import Link from "next/link";

import { permissionsFor } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import {
  useLeads,
  useLeadSources,
  useLeadStatuses,
  useMoveLead,
} from "@/hooks/leads/use-leads-board";
import { resolveStatusChange } from "@/lib/leads-board";
import {
  readLeadsViewMode,
  writeLeadsViewMode,
  type LeadsViewMode,
} from "@/lib/leads-view-mode";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";
import { LeadsBoard } from "./leads-board";
import { LeadsTable } from "./leads-table";
import { NewLeadDialog } from "./new-lead-dialog";
import { AppointmentDialog } from "./appointment-dialog";
import { ConvertDialog } from "./convert-dialog";
import { LeadDetailDrawer } from "./lead-detail-drawer";
import { cn } from "@/lib/utils";

export function LeadsView() {
  const { user } = useUser();
  const canConfigure = user ? permissionsFor(user).can("crm.configure") : false;
  const { data: statuses = [] } = useLeadStatuses();
  const { data: sources = [] } = useLeadSources();
  const { data: leads = [] } = useLeads();
  const move = useMoveLead();

  const [view, setView] = useState<LeadsViewMode>("board");
  useEffect(() => {
    setView(readLeadsViewMode());
  }, []);

  const [newOpen, setNewOpen] = useState(false);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [pendingAppt, setPendingAppt] = useState<{
    lead: Lead;
    status: LeadStatus;
  } | null>(null);
  const [pendingConvert, setPendingConvert] = useState<Lead | null>(null);

  const sourceById = useMemo(() => {
    const map: Record<number, LeadSource> = {};
    for (const source of sources) map[source.id] = source;
    for (const lead of leads) {
      if (typeof lead.source === "object") map[lead.source.id] = lead.source;
    }
    return map;
  }, [sources, leads]);

  function changeView(next: LeadsViewMode) {
    setView(next);
    writeLeadsViewMode(next);
  }

  function handleChangeStatus(lead: Lead, status: LeadStatus) {
    const action = resolveStatusChange(lead, status);
    switch (action.kind) {
      case "noop":
        return;
      case "appointment":
        setPendingAppt({ lead, status });
        return;
      case "convert":
        setPendingConvert(lead);
        return;
      case "move":
        move.mutate({ leadId: lead.id, statusId: status.id });
        return;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl text-text-primary">Leads</h1>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(value) => {
              if (value === "board" || value === "table") changeView(value);
            }}
            variant="secondary"
            size="sm"
          >
            <ToggleGroupItem value="board" aria-label="Board view">
              <LayoutGrid className="mr-1.5 h-4 w-4" />
              Board
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="Table view">
              <Table2 className="mr-1.5 h-4 w-4" />
              Table
            </ToggleGroupItem>
          </ToggleGroup>
          {canConfigure && (
            <Link
              href="/crm/leads/settings"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "inline-flex items-center")}
            >
              <Settings className="mr-1.5 h-4 w-4" />
              Configure
            </Link>
          )}
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Lead
          </Button>
        </div>
      </div>

      {view === "board" ? (
        <LeadsBoard
          statuses={statuses}
          leads={leads}
          sourceById={sourceById}
          onOpenLead={setOpenLead}
          onChangeStatus={handleChangeStatus}
        />
      ) : (
        <LeadsTable
          statuses={statuses}
          leads={leads}
          sourceById={sourceById}
          onOpenLead={setOpenLead}
          onChangeStatus={handleChangeStatus}
        />
      )}

      <NewLeadDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        statuses={statuses}
        sources={sources}
      />
      {pendingAppt && (
        <AppointmentDialog
          lead={pendingAppt.lead}
          targetStatus={pendingAppt.status}
          onClose={() => setPendingAppt(null)}
        />
      )}
      {pendingConvert && (
        <ConvertDialog
          lead={pendingConvert}
          onClose={() => setPendingConvert(null)}
        />
      )}
      <LeadDetailDrawer
        open={openLead !== null}
        lead={openLead}
        statuses={statuses}
        sources={sources}
        onClose={() => setOpenLead(null)}
      />
    </div>
  );
}
