"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import { DataSheet } from "@/components/data-sheet/data-sheet";
import { PageContainer } from "@/components/layout/page-container";
import { StaffPointsPanel } from "@/components/points/staff-points-panel";
import { TypographyH1 } from "@/components/typography/h1";
import { Input, Sheet, Skeleton } from "@/components/primitives";
import { useContainerHeight } from "@/hooks/use-container-height";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { makeReadOnlyAdapter } from "@/lib/data-sheets/read-only-adapter";
import { fetchStaffPointsSheet } from "@/lib/points-api";
import {
  buildStaffPointsColumns,
  cellText,
} from "@/lib/points/staff-sheet-columns";
import type { StaffPointsSheetRow } from "@/types/points";
import {
  GridCellKind,
  type GridCell,
  type Item,
} from "@glideapps/glide-data-grid";
import { useQuery } from "@tanstack/react-query";
import { Search } from "iconoir-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

export default function PointsPage() {
  const { user, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { can } = usePermissions();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const setDebouncedSearch = useDebouncedCallback(setDebouncedQ, 150);
  const [selectedRow, setSelectedRow] = useState<StaffPointsSheetRow | null>(
    null,
  );
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const allowed =
    Boolean(user && can("points.view")) &&
    Boolean(tenant?.is_staff_points_enabled);

  useEffect(() => {
    if (!userLoading && !tenantLoading && user && !allowed) {
      router.replace("/home");
    }
  }, [userLoading, tenantLoading, user, allowed, router]);

  const dataQuery = useQuery({
    queryKey: ["staff-points-sheet", debouncedQ],
    queryFn: () => fetchStaffPointsSheet(debouncedQ.trim() || undefined),
    enabled: allowed,
  });

  const pointTypes = dataQuery.data?.point_types ?? [];
  const rows = dataQuery.data?.rows ?? [];
  const hasActiveSearch = Boolean(debouncedQ.trim());

  const columns = useMemo(
    () => buildStaffPointsColumns(pointTypes),
    [pointTypes],
  );
  const fieldByColumn = useMemo(
    () => columns.map((c) => String(c.id)),
    [columns],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const r = rows[row];
      const colId = fieldByColumn[col];
      if (!r || !colId) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        };
      }
      const value = cellText(r, colId);
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
      };
    },
    [rows, fieldByColumn],
  );

  const adapter = useMemo(
    () =>
      makeReadOnlyAdapter({
        rowCount: rows.length,
        getCellValue: (row, field) => {
          const r = rows[row];
          return r ? cellText(r, field) : "";
        },
      }),
    [rows],
  );

  const gridHeight = useContainerHeight(gridContainerRef, [
    rows.length,
    search,
    columns.length,
  ]);

  const handleCellClicked = useCallback(
    (cell: Item) => {
      const [, row] = cell;
      const r = rows[row];
      if (r) setSelectedRow(r);
    },
    [rows],
  );

  const searchInput = (
    <div className="relative w-full min-w-[14rem] max-w-sm">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <Input
        type="search"
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => {
          const next = e.target.value;
          setSearch(next);
          setDebouncedSearch(next);
        }}
        className="h-9 pl-8 text-sm"
        aria-label="Filter staff points"
      />
    </div>
  );

  const sheetPanel =
    rows.length > 0 ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div ref={gridContainerRef} className="min-h-0 flex-1 overflow-hidden">
          <DataSheet
            adapter={adapter}
            columns={columns}
            fieldByColumn={fieldByColumn}
            getCellContent={getCellContent}
            menus={{ roleLabel: "Staff points" }}
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
            className="h-full"
            gridProps={{
              freezeColumns: 1,
              onCellClicked: handleCellClicked,
            }}
          />
        </div>
      </div>
    ) : null;

  const bodyContent = dataQuery.isLoading ? (
    <Skeleton className="h-64 w-full" aria-busy />
  ) : dataQuery.isError ? (
    <p className="text-sm text-danger" role="alert">
      Failed to load staff points. Please try again.
    </p>
  ) : !hasActiveSearch && rows.length === 0 ? (
    <p className="rounded-lg border border-border py-4 text-center text-sm text-balance text-text-muted">
      No staff with points data.
    </p>
  ) : rows.length === 0 ? (
    <p className="rounded-lg border border-border py-4 text-center text-sm text-balance text-text-muted">
      No staff match &quot;{debouncedQ.trim()}&quot;.
    </p>
  ) : (
    sheetPanel
  );

  if (userLoading || tenantLoading || (user && !allowed)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <PageContainer
      width="default"
      className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-4"
    >
      <header className="flex shrink-0 flex-col gap-1">
        <TypographyH1>Staff points</TypographyH1>
        <p className="max-w-2xl text-xs leading-snug text-text-secondary sm:text-sm">
          Point balances for active staff. Click a row to view history and
          adjust points.
        </p>
      </header>

      <div className="shrink-0">{searchInput}</div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {bodyContent}
      </div>

      <Sheet.Root
        open={selectedRow != null}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      >
        <Sheet.Portal>
          <Sheet.Backdrop />
          <Sheet.Popup
            side="right"
            className="w-full overflow-y-auto sm:max-w-lg"
          >
            {selectedRow ? (
              <>
                <Sheet.Title>{selectedRow.name}</Sheet.Title>
                <div className="mt-4">
                  <StaffPointsPanel
                    userId={selectedRow.id}
                    userName={selectedRow.name}
                  />
                </div>
              </>
            ) : null}
          </Sheet.Popup>
        </Sheet.Portal>
      </Sheet.Root>
    </PageContainer>
  );
}
