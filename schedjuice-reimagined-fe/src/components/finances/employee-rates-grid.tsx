"use client";

import "@glideapps/glide-data-grid/dist/index.css";

import { searchEntities, updateEntity } from "@/app/client-api/utils";
import { AttendanceAutosaveStatusBar } from "@/components/attendance/attendance-autosave-status";
import type { AttendanceAutosaveStatus } from "@/components/attendance/use-attendance-autosave";
import { Loader } from "@/components/form/loader";
import { queryParamDefault } from "@/config/defaults";
import { listToApiArray } from "@/helpers/filter-params";
import { formatMoney } from "@/helpers/money";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { operatorEnum } from "@/types/api";
import { role } from "@/types/user";
import {
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid";
import { DataSheet } from "@/components/data-sheet/data-sheet";
import type { SheetAdapter } from "@/components/data-sheet/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

export type RateColumn = { field: string; title: string };

export type EmployeeRatesSaveState = {
  saveStatus: AttendanceAutosaveStatus;
  lastSavedAt: number | null;
  onRetry: () => void;
};

type RateRow = {
  id: number;
  name: string;
  email: string;
  [rateField: string]: string | number | null;
};

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 36;
const MIN_GRID_HEIGHT = 400;
const MAX_GRID_HEIGHT_RATIO = 0.7;

const ROLE_FILTER = {
  filter_params: [
    {
      field_name: "roles",
      operator: operatorEnum.contained_by,
      value: listToApiArray([role.admin, role.manager, role.teacher]),
    },
  ],
};

export default function EmployeeRatesGrid({
  rateColumns,
  includeInactive,
  height: heightOverride,
  className,
  showSaveStatus = true,
  onSaveStateChange,
}: {
  rateColumns: RateColumn[];
  includeInactive: boolean;
  height?: number;
  className?: string;
  showSaveStatus?: boolean;
  onSaveStateChange?: (state: EmployeeRatesSaveState) => void;
}) {
  const currencySymbol = useTenantCurrencySymbol();
  const queryClient = useQueryClient();

  const [saveStatus, setSaveStatus] = useState<AttendanceAutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastFailedSave, setLastFailedSave] = useState<{
    id: number;
    field: string;
    value: string;
  } | null>(null);

  const rateFields = useMemo(
    () => rateColumns.map((c) => c.field),
    [rateColumns],
  );

  const fields = useMemo(
    () => ["id", "name", "email", ...rateFields],
    [rateFields],
  );

  const queryKey = useMemo(
    () => ["employee-rates", includeInactive, rateFields.join(",")],
    [includeInactive, rateFields],
  );

  const ratesQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await searchEntities(
        "users",
        {
          ...queryParamDefault,
          size: -1,
          sorts: ["name"],
          fields,
          ...(includeInactive ? { include_inactive: true } : {}),
        },
        ROLE_FILTER,
      );
      return (res.data?.data ?? []) as RateRow[];
    },
  });

  const [rows, setRows] = useState<RateRow[]>([]);
  useEffect(() => {
    if (ratesQuery.data) setRows(ratesQuery.data);
  }, [ratesQuery.data]);

  const [viewportMaxHeight, setViewportMaxHeight] = useState(700);
  useEffect(() => {
    if (heightOverride !== undefined) return;
    const update = () => {
      setViewportMaxHeight(Math.floor(window.innerHeight * MAX_GRID_HEIGHT_RATIO));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [heightOverride]);

  const columns = useMemo<GridColumn[]>(
    () => [
      { title: "Name", id: "name", width: 220 },
      { title: "Email", id: "email", width: 260 },
      ...rateColumns.map((c) => ({ title: c.title, id: c.field, width: 200 })),
    ],
    [rateColumns],
  );

  const colFields = useMemo(
    () => ["name", "email", ...rateFields],
    [rateFields],
  );

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      field,
      value,
    }: {
      id: number;
      field: string;
      value: string;
    }) => updateEntity("users", id, { [field]: value === "" ? null : value }),
    onMutate: (variables) => {
      setSaveStatus("saving");
      setLastFailedSave(variables);
    },
    onSuccess: () => {
      setLastSavedAt(Date.now());
      setSaveStatus("saved");
      setLastFailedSave(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      if (ratesQuery.data) setRows(ratesQuery.data);
      setSaveStatus("error");
    },
  });

  const handleRetry = useCallback(() => {
    if (lastFailedSave) saveMutation.mutate(lastFailedSave);
  }, [lastFailedSave, saveMutation]);

  useEffect(() => {
    onSaveStateChange?.({
      saveStatus,
      lastSavedAt,
      onRetry: handleRetry,
    });
  }, [saveStatus, lastSavedAt, handleRetry, onSaveStateChange]);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const field = colFields[col];
      const record = rows[row];
      const raw = record?.[field];
      const value = raw === null || raw === undefined ? "" : String(raw);
      const isRate = rateFields.includes(field);

      if (isRate) {
        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: value === "" ? "-" : formatMoney(value, currencySymbol),
          allowOverlay: true,
          readonly: false,
          contentAlign: "right",
        };
      }

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
      };
    },
    [colFields, rows, rateFields, currencySymbol],
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      if (newValue.kind !== GridCellKind.Text) return;
      const field = colFields[col];
      if (!rateFields.includes(field)) return;
      const record = rows[row];
      if (!record) return;

      const next = newValue.data.trim();
      setRows((prev) => {
        const copy = [...prev];
        copy[row] = { ...copy[row], [field]: next === "" ? null : next };
        return copy;
      });
      saveMutation.mutate({ id: record.id, field, value: next });
    },
    [colFields, rateFields, rows, saveMutation],
  );

  const adapter = useMemo<SheetAdapter>(
    () => ({
      rowCount: rows.length,
      getCellValue: (row, field) => {
        const raw = rows[row]?.[field];
        return raw === null || raw === undefined ? "" : String(raw);
      },
      setCellValue: (row, field, value) => {
        if (!rateFields.includes(field)) return;
        const record = rows[row];
        if (!record) return;
        const next = value.trim();
        setRows((prev) => {
          const copy = [...prev];
          copy[row] = { ...copy[row], [field]: next === "" ? null : next };
          return copy;
        });
        saveMutation.mutate({ id: record.id, field, value: next });
      },
      isCellEditable: (_row, field) => rateFields.includes(field),
      getNumericValue: (row, field) => {
        if (!rateFields.includes(field)) return null;
        const raw = rows[row]?.[field];
        if (raw === null || raw === undefined || raw === "") return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      },
    }),
    [rows, rateFields, saveMutation],
  );

  if (ratesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader />
        Loading rates…
      </div>
    );
  }

  if (ratesQuery.isError) {
    return (
      <p className="p-3 text-sm text-destructive">
        Could not load staff rates. Try again.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="p-3 text-sm text-muted-foreground leading-relaxed max-w-[65ch]">
        No staff match the current filter.
      </p>
    );
  }

  const contentHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT + 2;
  const gridHeight =
    heightOverride ??
    Math.min(
      Math.max(contentHeight, MIN_GRID_HEIGHT),
      viewportMaxHeight,
    );

  return (
    <DataSheet
      adapter={adapter}
      columns={columns}
      fieldByColumn={colFields}
      getCellContent={getCellContent}
      displayToSource={(r) => r}
      numericFields={rateFields}
      menus={{
        roleLabel: "Staff rates",
        statusSlot: showSaveStatus ? (
          <AttendanceAutosaveStatusBar
            status={saveStatus}
            lastSavedAt={lastSavedAt}
            onRetry={handleRetry}
          />
        ) : undefined,
      }}
      capabilities={{
        undo: true,
        copyPaste: true,
        statusBar: true,
        density: true,
        columnVisibility: false,
        contextMenu: true,
        gotoRow: true,
      }}
      height={gridHeight}
      className={className}
      formatNumber={(v) => formatMoney(String(v), currencySymbol)}
      gridProps={{ freezeColumns: 1, onCellEdited }}
    />
  );
}
