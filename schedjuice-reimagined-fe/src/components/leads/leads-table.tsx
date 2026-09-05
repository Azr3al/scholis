"use client";
import { Input, inputClassName } from "@/components/primitives";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GridCellKind,
  type CellClickedEventArgs,
  type GridCell,
  type GridColumn,
  type DataEditorRef,
  type Item,
} from "@glideapps/glide-data-grid";
import { Search } from "iconoir-react";

import { DataSheet } from "@/components/data-sheet/data-sheet";
import {
  statusPillRenderer,
  type StatusPillCell,
} from "@/components/data-sheet/cells/status-pill-cell";
import { makeReadOnlyAdapter } from "@/lib/data-sheets/read-only-adapter";
import {
  LEAD_TABLE_COLUMNS,
  filterLeads,
  leadFieldText,
  leadStatusColor,
  leadStatusName,
  type LeadTableField,
  type LeadTextContext,
} from "@/lib/leads-table";
import { leadStatusId } from "@/types/lead";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";
import {
  StatusPickerPopover,
  type StatusPickerTarget,
} from "./status-picker-popover";

export function LeadsTable({
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
  const gridRef = useRef<DataEditorRef>(null);
  const [search, setSearch] = useState("");
  const [pickerTarget, setPickerTarget] = useState<StatusPickerTarget | null>(
    null,
  );

  const statusById = useMemo(() => {
    const map: Record<number, LeadStatus> = {};
    for (const status of statuses) map[status.id] = status;
    return map;
  }, [statuses]);

  const textCtx = useMemo<LeadTextContext>(
    () => ({ sourceById, statusById }),
    [sourceById, statusById],
  );

  const rows = useMemo(() => filterLeads(leads, search), [leads, search]);

  const columns = useMemo<GridColumn[]>(
    () =>
      LEAD_TABLE_COLUMNS.map((c) => ({
        id: c.field,
        title: c.title,
        width: c.width,
      })),
    [],
  );
  const fieldByColumn = useMemo(
    () => LEAD_TABLE_COLUMNS.map((c) => c.field),
    [],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const lead = rows[row];
      const field = LEAD_TABLE_COLUMNS[col]?.field;
      if (!lead || !field) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "status") {
        const name = leadStatusName(lead, textCtx);
        const cell: StatusPillCell = {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: name,
          data: {
            kind: "status-pill-cell",
            name,
            color: leadStatusColor(lead, textCtx),
          },
        };
        return cell;
      }
      const value = leadFieldText(lead, field, textCtx);
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
      };
    },
    [rows, textCtx],
  );

  const adapter = useMemo(
    () =>
      makeReadOnlyAdapter({
        rowCount: rows.length,
        getCellValue: (row, field) => {
          const lead = rows[row];
          return lead
            ? leadFieldText(lead, field as LeadTableField, textCtx)
            : "";
        },
      }),
    [rows, textCtx],
  );

  const handleCellClicked = useCallback(
    (cell: Item, event: CellClickedEventArgs) => {
      const [col, row] = cell;
      const lead = rows[row];
      if (!lead) return;
      const field = LEAD_TABLE_COLUMNS[col]?.field;
      if (field === "status") {
        setPickerTarget({
          leadId: lead.id,
          currentStatusId: leadStatusId(lead),
          rect: {
            x: event.bounds.x,
            y: event.bounds.y,
            width: event.bounds.width,
            height: event.bounds.height,
          },
        });
        return;
      }
      onOpenLead(lead);
    },
    [rows, onOpenLead],
  );

  const [gridHeight, setGridHeight] = useState(520);
  useEffect(() => {
    const update = () =>
      setGridHeight(Math.max(320, window.innerHeight - 240));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const pickerLead =
    pickerTarget != null
      ? (leads.find((l) => l.id === pickerTarget.leadId) ?? null)
      : null;

  return (
    <div className="space-y-3">
      <div className="relative w-full min-w-[14rem] max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-sm"
          aria-label="Filter leads"
        />
      </div>

      {leads.length === 0 ? (
        <p className="rounded-lg border border-border py-4 text-center text-sm text-text-muted">
          No leads yet.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-border py-4 text-center text-sm text-text-muted">
          No leads match &quot;{search.trim()}&quot;.
        </p>
      ) : (
        <DataSheet
          ref={gridRef}
          adapter={adapter}
          columns={columns}
          fieldByColumn={fieldByColumn}
          getCellContent={getCellContent}
          customRenderers={[statusPillRenderer]}
          menus={{ roleLabel: "Leads" }}
          capabilities={{
            undo: false,
            copyPaste: true,
            statusBar: true,
            density: true,
            fontSize: true,
            contextMenu: true,
            gotoRow: true,
            columnReorder: true,
            columnResize: true,
            sortable: true,
            columnVisibility: true,
          }}
          height={gridHeight}
          gridProps={{
            freezeColumns: 1,
            onCellClicked: handleCellClicked,
          }}
        />
      )}

      <StatusPickerPopover
        target={pickerTarget}
        statuses={statuses}
        onSelect={(status) => {
          if (pickerLead) onChangeStatus(pickerLead, status);
          setPickerTarget(null);
        }}
        onClose={() => setPickerTarget(null)}
      />
    </div>
  );
}
