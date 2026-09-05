"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import { encodeQueryData, makePostRequest } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import {
  authorizedPersonChipLabel,
  ecUserChipRenderer,
} from "@/components/data-sheet/cells/excellent-choice-user-chip-cell";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import { PageContainer } from "@/components/layout/page-container";
import { SheetFullscreenShell } from "@/components/layout/sheet-fullscreen-shell";
import { usePageHeader } from "@/components/shell/use-page-header";
import CopyInput from "@/components/misc/copy-input";
import { DataSheet } from "@/components/data-sheet/data-sheet";
import { Skeleton } from "@/components/primitives";
import {
  UserSummaryPopover,
  type UserSummary,
  type UserSummaryTarget,
} from "@/components/users/user-summary-card";
import {
  formatDateRange,
  getDateISOString,
  getFirstDayOfMonth,
  getLastDayOfMonth,
} from "@/helpers/date";
import {
  isDateRangePreset,
  resolveDateRange,
} from "@/helpers/date-range-presets";
import { formatPlainAmount } from "@/helpers/money";
import { useContainerHeight } from "@/hooks/use-container-height";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import {
  buildExcellentChoiceColumns,
  buildExcellentChoiceSummaryRow,
  EXCELLENT_CHOICE_GRID_ROW_THRESHOLD,
  isExcellentChoiceSummaryRow,
  precomputeExcellentChoiceRowHeights,
  toExcellentChoiceFieldByColumn,
  toExcellentChoiceGridColumns,
  type ExcellentChoiceColumnMeta,
  type ExcellentChoiceDisplayRow,
  type ExcellentChoiceReportRow,
  type ExcellentChoiceSummaryRow,
} from "@/lib/data-sheets/excellent-choice-columns";
import { makeReadOnlyAdapter } from "@/lib/data-sheets/read-only-adapter";
import { cn } from "@/lib/utils";
import { ReportStyle } from "@/types/organization";
import {
  GridCellKind,
  type GridCell,
  type GridMouseEventArgs,
  type Item,
} from "@glideapps/glide-data-grid";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseAsIsoDateTime,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
} from "nuqs";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ExcellentChoiceReportFilters,
  type ExcellentChoiceFilterMode,
} from "./excellent-choice-report-filters";

const BASE_ROW_HEIGHT = 36;
const EMPTY_ROWS: ExcellentChoiceReportRow[] = [];
const EMPTY_DISPLAY_ROWS: ExcellentChoiceDisplayRow[] = [];
const USER_CHIP_FIELDS = new Set(["name", "authorized_person"]);

function userSummaryForRow(
  row: ExcellentChoiceReportRow,
  field: string,
): UserSummary | null {
  if (field === "name" && row.student_user_id) {
    return {
      id: row.student_user_id,
      name: row.name || "Student",
      email: row.student_email ?? undefined,
    };
  }
  if (field === "authorized_person" && row.authorized_by_user_id) {
    return {
      id: row.authorized_by_user_id,
      name:
        authorizedPersonChipLabel(
          row.authorized_person,
          row.authorized_by_name,
        ) || "Staff",
      email: row.authorized_by_email ?? undefined,
    };
  }
  return null;
}

function ExcellentChoiceReportPageInner() {
  const router = useRouter();
  const { tenant, isLoading: tenantLoading, isFetching: tenantFetching } = useTenant();
  const { user, isLoading: userLoading } = useUser();
  const { effectiveFullscreen, setAvailability } = useFullscreen();
  const defaultDateParser = useMemo(
    () => parseAsIsoDateTime.withDefault(new Date()),
    [],
  );
  const [monthDate, setMonthDate] = useQueryState("date", defaultDateParser);
  const [filterMode, setFilterMode] = useQueryState(
    "filterMode",
    parseAsStringEnum<ExcellentChoiceFilterMode>(["month", "range"]).withDefault(
      "month",
    ),
  );
  const [datePresetRaw] = useQueryState(
    "datePreset",
    parseAsString.withDefault("month"),
  );
  const [dateFromParam, setDateFromParam] = useQueryState(
    "dateFrom",
    parseAsString,
  );
  const [dateToParam, setDateToParam] = useQueryState("dateTo", parseAsString);
  const [userSummaryTarget, setUserSummaryTarget] =
    useState<UserSummaryTarget | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const rangeDatesSeededRef = useRef(false);

  const resolvedRange = useMemo(
    () => resolveDateRange("custom", dateFromParam, dateToParam),
    [dateFromParam, dateToParam],
  );

  useEffect(() => {
    if (filterMode !== "range" || rangeDatesSeededRef.current) return;
    if (resolvedRange != null) {
      rangeDatesSeededRef.current = true;
      return;
    }
    const legacyPreset = isDateRangePreset(datePresetRaw)
      ? datePresetRaw
      : "month";
    const seed =
      resolveDateRange(legacyPreset, dateFromParam, dateToParam) ??
      resolveDateRange("month", null, null);
    if (!seed) return;
    rangeDatesSeededRef.current = true;
    void setDateFromParam(seed.start);
    void setDateToParam(seed.end);
  }, [
    filterMode,
    resolvedRange,
    datePresetRaw,
    dateFromParam,
    dateToParam,
    setDateFromParam,
    setDateToParam,
  ]);

  const { dateFrom, dateTo, rangeLabel } = useMemo(() => {
    if (filterMode === "month") {
      const from = getDateISOString(getFirstDayOfMonth(monthDate));
      const to = getDateISOString(getLastDayOfMonth(monthDate));
      return {
        dateFrom: from,
        dateTo: to,
        rangeLabel: format(monthDate, "MMMM yyyy"),
      };
    }
    if (resolvedRange) {
      return {
        dateFrom: resolvedRange.start,
        dateTo: resolvedRange.end,
        rangeLabel: formatDateRange(resolvedRange.start, resolvedRange.end),
      };
    }
    const from = getDateISOString(getFirstDayOfMonth(new Date()));
    const to = getDateISOString(getLastDayOfMonth(new Date()));
    return {
      dateFrom: from,
      dateTo: to,
      rangeLabel: format(new Date(), "MMMM yyyy"),
    };
  }, [filterMode, monthDate, resolvedRange]);

  const allowed =
    tenant?.report_style === ReportStyle.EXCELLENT_CHOICE_STYLE;
  const tenantSettled = !tenantLoading && !tenantFetching;

  const rangeQueryEnabled =
    allowed && (filterMode === "month" || resolvedRange != null);

  const dataQuery = useQuery({
    queryKey: ["excellent-choice-report", filterMode, dateFrom, dateTo],
    queryFn: async () => {
      const res = await axiosClient.get(
        `reports/excellent-choice${encodeQueryData({
          date_from: dateFrom,
          date_to: dateTo,
        })}`,
      );
      const payload = res.data ?? {};
      return {
        rows: (payload.data ?? []) as ExcellentChoiceReportRow[],
        columns: (payload.columns ?? []) as ExcellentChoiceColumnMeta[],
        summary: (payload.summary ?? null) as
          | Pick<ExcellentChoiceSummaryRow, "date" | "voucher_no">
          | null,
      };
    },
    enabled: rangeQueryEnabled,
  });

  const sheetColumns = useMemo(
    () => buildExcellentChoiceColumns(dataQuery.data?.columns),
    [dataQuery.data?.columns],
  );
  const columns = useMemo(
    () => toExcellentChoiceGridColumns(sheetColumns),
    [sheetColumns],
  );
  const fieldByColumn = useMemo(
    () => toExcellentChoiceFieldByColumn(sheetColumns),
    [sheetColumns],
  );
  const rows = dataQuery.data?.rows ?? EMPTY_ROWS;
  const displayRows = useMemo(() => {
    if (rows.length === 0) {
      return EMPTY_DISPLAY_ROWS;
    }
    return [
      ...rows,
      buildExcellentChoiceSummaryRow(rows, dataQuery.data?.summary),
    ];
  }, [rows, dataQuery.data?.summary]);
  const exceedsGridThreshold =
    rows.length > EXCELLENT_CHOICE_GRID_ROW_THRESHOLD;

  const rowHeights = useMemo(
    () => precomputeExcellentChoiceRowHeights(displayRows, BASE_ROW_HEIGHT),
    [displayRows],
  );

  const getCellValue = useCallback(
    (rowIndex: number, field: string) => {
      const row = displayRows[rowIndex];
      if (!row) return "";
      const value = row[field as keyof ExcellentChoiceDisplayRow];
      return value == null ? "" : String(value);
    },
    [displayRows],
  );

  const adapter = useMemo(
    () =>
      makeReadOnlyAdapter({
        rowCount: displayRows.length,
        getCellValue,
        getNumericValue: (rowIndex, field) => {
          const row = displayRows[rowIndex];
          if (row && isExcellentChoiceSummaryRow(row)) {
            if (field === "voucher_no") {
              const parsed = Number(String(row.voucher_no).replace(/,/g, ""));
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          }
          if (field !== "cash_received" && field !== "voucher_no") {
            return null;
          }
          const raw = getCellValue(rowIndex, field);
          const parsed = Number(raw);
          return Number.isFinite(parsed) ? parsed : null;
        },
      }),
    [displayRows, getCellValue],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const field = fieldByColumn[col];
      const rowData = displayRows[row];
      const value = getCellValue(row, field);
      const columnDef = sheetColumns[col];
      const isSummaryRow = rowData != null && isExcellentChoiceSummaryRow(rowData);

      if (isSummaryRow && (field === "date" || field === "voucher_no")) {
        const display =
          field === "voucher_no" && value
            ? formatPlainAmount(String(value).replace(/,/g, ""))
            : value;
        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: display,
          allowOverlay: false,
          readonly: true,
          contentAlign: field === "voucher_no" ? "right" : "left",
          themeOverride: {
            baseFontStyle: "600 13px",
          },
        };
      }

      if (field === "cash_received") {
        const display = value ? formatPlainAmount(value) : "";
        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: display,
          allowOverlay: false,
          readonly: true,
          contentAlign: "right",
        };
      }

      if (field === "name" && rowData && !isSummaryRow && rowData.student_user_id) {
        const label = rowData.name || "—";
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: label,
          data: {
            kind: "ec-user-chip-cell",
            userId: rowData.student_user_id,
            name: label,
            email: rowData.student_email ?? "",
            label,
          },
        };
      }

      if (
        field === "authorized_person" &&
        rowData &&
        !isSummaryRow &&
        rowData.authorized_by_user_id
      ) {
        const label = authorizedPersonChipLabel(
          rowData.authorized_person,
          rowData.authorized_by_name,
        );
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: rowData.authorized_person,
          data: {
            kind: "ec-user-chip-cell",
            userId: rowData.authorized_by_user_id,
            name: label,
            email: rowData.authorized_by_email ?? "",
            label: label || "—",
          },
        };
      }

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
        allowWrapping: Boolean(columnDef?.multiline),
      };
    },
    [fieldByColumn, getCellValue, displayRows, sheetColumns],
  );

  const getRowHeight = useCallback(
    (rowIndex: number) => rowHeights[rowIndex] ?? BASE_ROW_HEIGHT,
    [rowHeights],
  );

  const onItemHovered = useCallback(
    (args: GridMouseEventArgs) => {
      if (args.kind !== "cell") {
        setUserSummaryTarget(null);
        return;
      }
      const [col, rowIndex] = args.location;
      const field = fieldByColumn[col];
      if (!field || !USER_CHIP_FIELDS.has(field)) {
        setUserSummaryTarget(null);
        return;
      }
      const rowData = displayRows[rowIndex];
      if (!rowData || isExcellentChoiceSummaryRow(rowData)) {
        setUserSummaryTarget(null);
        return;
      }
      const summary = userSummaryForRow(rowData, field);
      if (!summary || !args.bounds) {
        setUserSummaryTarget(null);
        return;
      }
      setUserSummaryTarget({
        user: summary,
        rect: {
          x: args.bounds.x,
          y: args.bounds.y,
          width: args.bounds.width,
          height: args.bounds.height,
        },
      });
    },
    [fieldByColumn, displayRows],
  );

  const gridHeight = useContainerHeight(gridContainerRef, [
    displayRows.length,
    dataQuery.isLoading,
    exceedsGridThreshold,
    filterMode,
  ]);

  const { mutate: downloadExcel, isPending: isDownloading } = useMutation({
    mutationFn: async () => {
      const res = await makePostRequest(
        "reports/excellent-choice",
        { date_from: dateFrom, date_to: dateTo },
        {},
        {},
        { responseType: "blob" },
      );
      return res.data as Blob;
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `excellent_choice_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  });

  const reportToolbar = useMemo(
    () => (
      <ExcellentChoiceReportFilters
        filterMode={filterMode}
        onFilterModeChange={(mode) => void setFilterMode(mode)}
        monthDate={monthDate}
        onMonthDateChange={(date) => void setMonthDate(date)}
        dateFrom={dateFromParam}
        dateTo={dateToParam}
        onDateFromChange={(value) => void setDateFromParam(value)}
        onDateToChange={(value) => void setDateToParam(value)}
        onDownloadExcel={() => downloadExcel()}
        downloadDisabled={
          isDownloading ||
          dataQuery.isLoading ||
          (filterMode === "range" && resolvedRange == null)
        }
        downloadLoading={isDownloading}
      />
    ),
    [
      filterMode,
      setFilterMode,
      monthDate,
      setMonthDate,
      dateFromParam,
      dateToParam,
      setDateFromParam,
      setDateToParam,
      downloadExcel,
      isDownloading,
      dataQuery.isLoading,
      resolvedRange,
    ],
  );

  usePageHeader(
    useMemo(
      () =>
        allowed
          ? {
              breadcrumb: (
                <h1 className="font-serif text-lg text-text-primary">
                  Excellent Choice Style
                </h1>
              ),
              toolbar: reportToolbar,
            }
          : null,
      [allowed, reportToolbar],
    ),
  );

  useEffect(() => {
    if (!allowed) return;
    setAvailability({
      enabled: true,
      label: "Excellent Choice report fullscreen",
    });
    return () => setAvailability({ enabled: false });
  }, [allowed, setAvailability]);

  useEffect(() => {
    if (!tenantSettled || userLoading || !user) return;
    if (!allowed) {
      router.replace("/finances/reports");
    }
  }, [tenantSettled, userLoading, user, allowed, router]);

  if (userLoading || !tenantSettled) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!allowed) {
    return null;
  }

  const reportSummary =
    dataQuery.isLoading || dataQuery.isError
      ? undefined
      : `${rows.length} receipt${rows.length === 1 ? "" : "s"} · ${rangeLabel}`;

  const largeDatasetMessage = (
    <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
      This period has {rows.length} receipts — use Download Excel to view the
      full report.
    </p>
  );

  const rangeUnavailableMessage =
    filterMode === "range" && resolvedRange == null ? (
      <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
        Choose a valid date range to load the report.
      </p>
    ) : null;

  const sheetPanel =
    rows.length > 0 && !exceedsGridThreshold ? (
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          effectiveFullscreen ? "h-full flex-1" : "flex-1 rounded-md border",
        )}
      >
        <div ref={gridContainerRef} className="relative min-h-0 flex-1 overflow-hidden">
          <DataSheet
            adapter={adapter}
            columns={columns}
            fieldByColumn={fieldByColumn}
            getCellContent={getCellContent}
            customRenderers={[ecUserChipRenderer]}
            numericFields={["cash_received", "voucher_no"]}
            menus={{ roleLabel: "Excellent Choice Report" }}
            capabilities={{
              undo: false,
              copyPaste: true,
              statusBar: true,
              density: true,
              fontSize: true,
              contextMenu: true,
              gotoRow: true,
              columnResize: true,
            }}
            height={gridHeight}
            fullscreenSlot={
              effectiveFullscreen ? undefined : <FullscreenToggle />
            }
            className={
              effectiveFullscreen ? "h-full rounded-none border-0" : "h-full"
            }
            gridProps={{
              rowHeight: getRowHeight,
              onItemHovered,
            }}
          />
          <UserSummaryPopover
            target={userSummaryTarget}
            onClose={() => setUserSummaryTarget(null)}
          />
        </div>
      </div>
    ) : null;

  const bodyContent = rangeUnavailableMessage ? (
    rangeUnavailableMessage
  ) : dataQuery.isLoading ? (
    <Skeleton className="h-64 w-full" aria-busy />
  ) : dataQuery.isError ? (
    <p className="text-sm text-danger" role="alert">
      Failed to load Excellent Choice report. Please try again.
    </p>
  ) : rows.length === 0 ? (
    <p className="rounded-lg border py-4 text-center text-sm text-balance text-text-muted">
      No fully verified receipts in this date range.
    </p>
  ) : exceedsGridThreshold ? (
    largeDatasetMessage
  ) : (
    sheetPanel
  );

  if (effectiveFullscreen) {
    return (
      <SheetFullscreenShell
        className="min-h-0 flex-1"
        layout="grid-first"
        title="Excellent Choice Style"
        summary={reportSummary}
        actions={reportToolbar}
        main={
          rows.length > 0 && !exceedsGridThreshold ? (
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
    <PageContainer width="full" className="flex min-h-[70vh] flex-col gap-4">
      <Link
        href="/finances/reports"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="size-4" />
        Back to Reports
      </Link>
      <p className="text-sm text-text-secondary">
        Voucher log for fully verified receipts. Multi-course rows use one line
        per course; values within a course are comma-separated.
      </p>
      <CopyInput label="Share report link" text={window.location.href} />
      {bodyContent}
    </PageContainer>
  );
}

const ExcellentChoiceReportPage = () => (
  <Suspense
    fallback={
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    }
  >
    <ExcellentChoiceReportPageInner />
  </Suspense>
);

export default ExcellentChoiceReportPage;
