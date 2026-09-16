"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import { axiosClient } from "@/lib/api";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { SheetFullscreenShell } from "@/components/layout/sheet-fullscreen-shell";
import CopyInput from "@/components/misc/copy-input";
import {
  idPhotoRenderer,
  initialsFromName,
} from "@/components/data-sheet/cells/id-photo-cell";
import { IdPhotoPanel } from "@/components/data-sheet/cells/id-photo-panel";
import { IdPhotosExportButton } from "@/components/data-sheet/id-photos-export-button";
import { IdCardsExportButton } from "@/components/data-sheet/id-cards-export-button";
import { DataSheet } from "@/components/data-sheet/data-sheet";
import {
  canAccessStaffShortcuts,
  canAccessStudentDataSheet,
} from "@/helpers/authorization";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useContainerHeight } from "@/hooks/use-container-height";
import { useIdPhotoUrlCache } from "@/hooks/use-id-photo-url-cache";
import { useSheetIdPhotoLoader } from "@/hooks/use-sheet-id-photo-loader";
import { useUser } from "@/hooks/useUser";
import { makeReadOnlyAdapter } from "@/lib/data-sheets/read-only-adapter";
import type { StaffDataSheetRow } from "@/types/data-sheets";
import {
  GridCellKind,
  type GridCell,
  type GridColumn,
  type DataEditorRef,
  type Item,
} from "@glideapps/glide-data-grid";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft, Search } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { cn } from "@/lib/utils";
import { FilterToolbar } from "@/components/filters/filter-toolbar";
import { Input, Skeleton } from "@/components/primitives";

const COLS = [
  { id: "name", title: "Name", width: 200 },
  { id: "alternative_name", title: "Alternative name", width: 160 },
  { id: "code", title: "Code", width: 130 },
  { id: "id_photo", title: "ID photo", width: 90 },
  { id: "roles", title: "Roles", width: 160 },
  { id: "phone_number", title: "Phone", width: 140 },
  { id: "communication_email", title: "Email", width: 240 },
  { id: "gender", title: "Gender", width: 100 },
  { id: "date_of_birth", title: "DOB", width: 120 },
  { id: "nrc_passport", title: "NRC/Passport", width: 180 },
  { id: "city", title: "City", width: 140 },
  { id: "township", title: "Township", width: 140 },
  { id: "region", title: "Region", width: 140 },
  { id: "facebook_account_link", title: "Facebook", width: 220 },
] as const;

function staffText(r: StaffDataSheetRow, field: string): string {
  if (field === "roles") {
    return (r.roles ?? []).join(", ");
  }
  if (field === "id_photo") {
    return "";
  }
  const v = (r as Record<string, unknown>)[field];
  return v == null ? "" : String(v);
}

export default function StaffDataPage() {
  const { user, isLoading: userLoading } = useUser();
  const { effectiveFullscreen, setAvailability } = useFullscreen();
  const router = useRouter();
  const [shareUrl, setShareUrl] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const setDebouncedSearch = useDebouncedCallback(setDebouncedQ, 150);
  const [photoTarget, setPhotoTarget] = useState<StaffDataSheetRow | null>(null);
  const gridRef = useRef<DataEditorRef>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const allowed = user ? canAccessStudentDataSheet(user) : false;

  useEffect(() => {
    setShareUrl(typeof window !== "undefined" ? window.location.href : "");
  }, []);

  useEffect(() => {
    if (!userLoading && user && !canAccessStaffShortcuts(user)) {
      router.replace("/home");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (
      !userLoading &&
      user &&
      canAccessStaffShortcuts(user) &&
      !canAccessStudentDataSheet(user)
    ) {
      router.replace("/shortcuts");
    }
  }, [userLoading, user, router]);

  useEffect(() => {
    if (!allowed) return;
    setAvailability({ enabled: true, label: "Staff data fullscreen" });
    return () => setAvailability({ enabled: false });
  }, [allowed, setAvailability]);

  const dataQuery = useQuery({
    queryKey: ["staff-data-sheet", debouncedQ],
    queryFn: async () => {
      const params = debouncedQ.trim()
        ? `?q=${encodeURIComponent(debouncedQ.trim())}`
        : "";
      const res = await axiosClient.get(`reports/staff-data-sheet${params}`);
      return (res.data?.data ?? []) as StaffDataSheetRow[];
    },
    enabled: allowed,
  });

  const rows = dataQuery.data ?? [];
  const hasActiveSearch = Boolean(debouncedQ.trim());

  const livePhotoTarget = useMemo(() => {
    if (!photoTarget) return null;
    return rows.find((r) => r.id === photoTarget.id) ?? photoTarget;
  }, [photoTarget, rows]);

  const columns = useMemo<GridColumn[]>(
    () => COLS.map((c) => ({ id: c.id, title: c.title, width: c.width })),
    [],
  );
  const fieldByColumn = useMemo(() => COLS.map((c) => c.id), []);

  const idPhotoCache = useIdPhotoUrlCache();
  const loadVisibleIdPhotos = useSheetIdPhotoLoader(rows, idPhotoCache);

  useEffect(() => {
    if (rows.length > 0) {
      loadVisibleIdPhotos({ y: 0, height: 30 });
    }
  }, [rows.length, loadVisibleIdPhotos]);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const r = rows[row];
      const field = fieldByColumn[col];
      if (!r) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        };
      }
      if (field === "id_photo") {
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: "",
          data: {
            kind: "id-photo-cell",
            userId: r.id,
            url: r.has_id_photo
              ? (idPhotoCache.getUrl(r.id, "thumb") ?? null)
              : null,
            initials: initialsFromName(r.name),
          },
        };
      }
      const value = staffText(r, field);
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
      };
    },
    [rows, fieldByColumn, idPhotoCache.revision, idPhotoCache.getUrl],
  );

  const adapter = useMemo(
    () =>
      makeReadOnlyAdapter({
        rowCount: rows.length,
        getCellValue: (row, field) => {
          const r = rows[row];
          return r ? staffText(r, field) : "";
        },
      }),
    [rows],
  );

  const gridHeight = useContainerHeight(gridContainerRef, [
    effectiveFullscreen,
    rows.length,
    search,
  ]);

  const searchInput = (
    <div className="relative w-full min-w-[14rem] max-w-sm">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <Input
        type="search"
        placeholder="Search by name, code, or phone…"
        value={search}
        onChange={(e) => {
          const next = e.target.value;
          setSearch(next);
          setDebouncedSearch(next);
        }}
        className="h-9 pl-8 text-sm"
        aria-label="Filter staff"
      />
    </div>
  );

  const filtersRow = (
    <div className="flex flex-wrap items-center gap-2">
      {searchInput}
      <IdPhotosExportButton audience="staff" />
      <IdCardsExportButton audience="staff" rows={rows} />
    </div>
  );

  const handleCellClicked = useCallback(
    (cell: Item) => {
      const [col, row] = cell;
      const field = fieldByColumn[col];
      const r = rows[row];
      if (!r || field !== "id_photo") return;
      setPhotoTarget(r);
    },
    [fieldByColumn, rows],
  );

  const sheetPanel =
    rows.length > 0 ? (
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          effectiveFullscreen ? "h-full flex-1" : "flex-1 rounded-md border",
        )}
      >
        <div ref={gridContainerRef} className="min-h-0 flex-1 overflow-hidden">
          <DataSheet
            ref={gridRef}
            adapter={adapter}
            columns={columns}
            fieldByColumn={fieldByColumn}
            getCellContent={getCellContent}
            customRenderers={[idPhotoRenderer]}
            menus={{ roleLabel: "Staff data" }}
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
            fullscreenSlot={effectiveFullscreen ? undefined : <FullscreenToggle />}
            className={
              effectiveFullscreen ? "h-full rounded-none border-0" : "h-full"
            }
            gridProps={{
              freezeColumns: 1,
              onCellClicked: handleCellClicked,
              onVisibleRegionChanged: (region) => {
                loadVisibleIdPhotos({ y: region.y, height: region.height });
              },
            }}
          />
        </div>
        {livePhotoTarget && user ? (
          <IdPhotoPanel
            row={livePhotoTarget}
            user={user}
            onClose={() => setPhotoTarget(null)}
            subjectLabel="staff member"
            audience="staff"
            onIdPhotoCacheInvalidate={idPhotoCache.invalidate}
          />
        ) : null}
      </div>
    ) : null;

  usePageHeader(
    useMemo(
      () =>
        user && canAccessStaffShortcuts(user) && allowed
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  Staff Data
                </h1>
              ),
              toolbar: (
                <FilterToolbar>
                  {filtersRow}
                </FilterToolbar>
              ),
            }
          : null,
      [user, allowed, search, debouncedQ],
    ),
  );

  const bodyContent = dataQuery.isLoading ? (
    <Skeleton className="h-64 w-full" aria-busy />
  ) : dataQuery.isError ? (
    <p className="text-sm text-danger" role="alert">
      Failed to load staff data. Please try again.
    </p>
  ) : !hasActiveSearch && (dataQuery.data ?? []).length === 0 ? (
    <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
      No active staff.
    </p>
  ) : rows.length === 0 ? (
    <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
      No staff match &quot;{debouncedQ.trim()}&quot;.
    </p>
  ) : (
    sheetPanel
  );

  if (userLoading || (user && !canAccessStaffShortcuts(user))) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!user) return null;

  if (effectiveFullscreen) {
    return (
      <SheetFullscreenShell
        className="min-h-0 flex-1"
        layout="grid-first"
        title="Staff Data"
        summary={
          dataQuery.isLoading
            ? undefined
            : hasActiveSearch
              ? `${rows.length} matching staff`
              : `${(dataQuery.data ?? []).length} active staff`
        }
        actions={filtersRow}
        main={
          rows.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {bodyContent}
            </div>
          ) : (
            bodyContent
          )
        }
      />
    );
  }

  return (
    <PageContainer width="default" className="flex min-h-0 flex-1 max-w-full min-w-0 flex-col gap-4">
      <header className="shrink-0 space-y-2">
        <Link
          href="/shortcuts"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-muted hover:text-text-primary"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
          Shortcuts
        </Link>
        <p className="max-w-2xl text-xs leading-snug text-text-muted sm:text-sm">
          Active staff and their profile details (students excluded).
        </p>
      </header>

      <CopyInput
        className="shrink-0 space-y-1.5"
        label="Share this sheet"
        text={shareUrl}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {bodyContent}
      </div>
    </PageContainer>
  );
}
