"use client";
import { Button, Select } from "@/components/primitives";
import { TextShimmer } from "@/components/misc/text-shimmer";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { parseImport } from "@/app/client-api/imports";
import { useImportFields } from "@/hooks/imports/use-import-fields";
import useImportStore from "@/store/import-store";
import { buildAutoMapping, coursesMappedColumn } from "@/lib/imports/wizard-logic";
import { clearRememberedImportFieldDefaults } from "@/lib/imports/remembered-imports";
import { formatRoleLabel } from "@/helpers/role";
import { role } from "@/types/user";
import { ColumnMappingTable, groupFields } from "./column-mapping-select";
import { CreateCustomFieldSheet } from "./create-custom-field-sheet";
import { MapStepContinueBar } from "./map-step-continue-bar";
import { MatchConfigPanel } from "./match-config-panel";
import { RequiredFieldsPanel } from "./required-fields-panel";
import { ImportCourseScopeBar } from "@/components/import-grid/import-course-scope-bar";
import { WarningCircle as AlertCircle, InfoCircle as Info, Xmark as X } from "iconoir-react";

const IMPORT_ROLES = [
  role.student,
  role.teacher,
  role.manager,
  role.admin,
  role.finance,
  role.hr,
] as const;

export function MapStep() {
  const parse = useImportStore((s) => s.parse);
  const lastFile = useImportStore((s) => s.lastFile);
  const mapping = useImportStore((s) => s.mapping);
  const roleValue = useImportStore((s) => s.role);
  const setParse = useImportStore((s) => s.setParse);
  const setMapping = useImportStore((s) => s.setMapping);
  const setColumnMapping = useImportStore((s) => s.setColumnMapping);
  const setRole = useImportStore((s) => s.setRole);
  const rememberedImportApplied = useImportStore((s) => s.rememberedImportApplied);
  const fieldDefaults = useImportStore((s) => s.fieldDefaults);
  const clearFieldDefaults = useImportStore((s) => s.clearFieldDefaults);
  const setRememberedImportApplied = useImportStore(
    (s) => s.setRememberedImportApplied,
  );

  const { data: fields, isLoading: fieldsLoading } = useImportFields(
    roleValue,
    Boolean(parse),
  );

  const [createColIndex, setCreateColIndex] = useState<number | null>(null);

  const sheetMutation = useMutation({
    mutationFn: (sheet: string) => {
      if (!lastFile) throw new Error("No file");
      return parseImport(lastFile, sheet);
    },
    onSuccess: (result) => {
      setParse(result);
      if (fields?.length) {
        setMapping(buildAutoMapping(result.headers, fields));
      }
    },
  });

  const handleColumnMap = useCallback(
    (colIndex: number, value: string) => {
      if (value === "__create__") {
        setCreateColIndex(colIndex);
        return;
      }
      setColumnMapping(colIndex, value === "__ignore__" ? null : value);
    },
    [setColumnMapping],
  );

  const handleFieldCreated = useCallback(
    (fieldKey: string) => {
      if (createColIndex != null) {
        setColumnMapping(createColIndex, fieldKey);
      }
      setCreateColIndex(null);
    },
    [createColIndex, setColumnMapping],
  );

  const hasFieldDefaults = useMemo(
    () => Object.values(fieldDefaults).some((value) => value.trim() !== ""),
    [fieldDefaults],
  );

  const handleClearDefaults = useCallback(() => {
    clearFieldDefaults();
    if (parse) {
      clearRememberedImportFieldDefaults(parse.headers);
    }
    setRememberedImportApplied(false);
  }, [clearFieldDefaults, parse, setRememberedImportApplied]);

  const handleSheetOpenChange = useCallback((open: boolean) => {
    if (!open) setCreateColIndex(null);
  }, []);

  useEffect(() => {
    if (!parse || !fields?.length) return;
    // Run once per header set — not when every column is still unmapped (all null).
    const mappingInitialized =
      Object.keys(mapping).length >= parse.headers.length;
    if (!mappingInitialized) {
      setMapping(buildAutoMapping(parse.headers, fields));
    }
  }, [parse, fields, mapping, setMapping]);

  const grouped = useMemo(() => groupFields(fields ?? []), [fields]);
  const coursesColIndex = useMemo(
    () => coursesMappedColumn(mapping),
    [mapping],
  );
  const hasCoursesColumn = coursesColIndex != null;

  if (!parse) return null;

  const columnHeader =
    createColIndex != null ? (parse.headers[createColIndex] ?? "") : "";

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48 space-y-1">
          <label className="text-xs text-muted-foreground">Import as role</label>
          <Select value={roleValue} onValueChange={setRole} items={IMPORT_ROLES.map((r) => ({ value: String(r), label: formatRoleLabel(r) }))} />
        </div>
        {fieldsLoading ? (
          <TextShimmer className="text-sm">Loading fields…</TextShimmer>
        ) : null}
      </div>

      {parse.sheetNames.length > 1 ? (
        <div className="w-72">
          <Select value={parse.activeSheet} onValueChange={(sheet) => sheetMutation.mutate(sheet)} disabled={sheetMutation.isLoading} items={parse.sheetNames.map((name) => ({ value: String(name), label: name }))} placeholder='Sheet' />
        </div>
      ) : null}

      {sheetMutation.isLoading ? (
        <TextShimmer>Loading sheet…</TextShimmer>
      ) : null}

      {rememberedImportApplied ? (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/60 dark:bg-blue-950/30">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-blue-950 dark:text-blue-100">
              Reapplied settings from a previous import of this layout.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
            aria-label="Dismiss"
            onClick={() => setRememberedImportApplied(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {hasCoursesColumn ? (
        <ImportCourseScopeBar confirmOnChange={false} />
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
              No courses column detected
            </p>
            <p className="mt-0.5 text-sm text-amber-900/80 dark:text-amber-200/90">
              Only user accounts will be imported, with no course enrollments.
              Map a column to Courses below if your file includes enrollments.
            </p>
          </div>
        </div>
      )}

      <ColumnMappingTable
        headers={parse.headers}
        rows={parse.rows}
        mapping={mapping}
        grouped={grouped}
        onMap={handleColumnMap}
      />

      <MatchConfigPanel />

      {hasFieldDefaults ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Default values are set for unmapped fields and will apply to every row.
          </p>
          <Button type="button" variant="secondary" onClick={handleClearDefaults}>
            Clear defaults
          </Button>
        </div>
      ) : null}

      <RequiredFieldsPanel fields={fields ?? []} headers={parse.headers} />

      <MapStepContinueBar fields={fields ?? []} />

      <CreateCustomFieldSheet
        open={createColIndex !== null}
        columnHeader={columnHeader}
        onOpenChange={handleSheetOpenChange}
        onCreated={handleFieldCreated}
      />
    </div>
  );
}
