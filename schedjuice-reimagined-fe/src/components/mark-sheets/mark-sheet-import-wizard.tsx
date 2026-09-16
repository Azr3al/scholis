"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import { Button, Select, useToast } from "@/components/primitives";
import { UserMatchesPanel } from "@/components/import-grid/user-matches-panel";
import {
  MarkSheetImportGrid,
  applyColumnMapRole,
  columnsFromRoles,
} from "@/components/mark-sheets/mark-sheet-import-grid";
import {
  MarkSheetPasteGrid,
  type MarkSheetPasteGridHandle,
} from "@/components/mark-sheets/mark-sheet-paste-grid";
import { useContainerHeight } from "@/hooks/use-container-height";
import {
  type ColumnMapRole,
  countIdentifierColumns,
  highestPriorityIdentifierField,
  kindToDefaultColumnMapRole,
  normalizeColumnMapping,
  shouldRematchOnRoleChange,
} from "@/lib/mark-sheets/column-map-role";
import { flattenTwoRowHeaders } from "@/lib/mark-sheets/header-flatten";
import {
  MARK_SHEET_REVIEW_PANELS_RESERVE,
  resolveMarkSheetGridHeight,
} from "@/lib/mark-sheets/mark-sheet-grid-height";
import { inferImportColumns } from "@/lib/mark-sheets/mark-sheet-import-inference";
import {
  commitMarkSheetImport,
  listCourseRosterStudents,
  matchMarkSheetStudents,
  matchRubrics,
  parseMarkSheetImport,
} from "@/lib/mark-sheets-api";
import {
  buildMarkSheetImportRows,
  countUnresolvedMarkSheetRows,
  countUnmatchedMarkSheetRows,
} from "@/lib/mark-sheets/mark-sheet-commit";
import {
  buildUserMatches,
  cellKey,
  confirmAllExactMatches,
  countPendingExactMatches,
  countPendingFuzzyMatches,
  countPendingNameMismatches,
  type CellResolution,
  type MatchSpecResolved,
} from "@/lib/imports/resolution";
import type { RubricColumn } from "@/types/mark-sheets";

type Props = {
  courseId: string;
  title: string;
  rubricTitle: string;
  onRubricTitleChange: (title: string) => void;
  onExistingRubricChange?: (id: number | null) => void;
  year: number;
  month: number;
  examDate: string | null;
  onComplete: (sheetId: number) => void;
};

function buildColumnRoles(
  columns: RubricColumn[],
  mapping: Record<string, number>,
): Record<number, ColumnMapRole> {
  const roles: Record<number, ColumnMapRole> = {};
  columns.forEach((col, idx) => {
    roles[idx] = kindToDefaultColumnMapRole(col.kind, mapping, idx);
  });
  return roles;
}

function buildMatchSpecs(mapping: Record<string, number>): MatchSpecResolved[] {
  return Object.entries(mapping).map(([fieldKey, colIndex]) => ({
    fieldKey,
    colIndex,
    type: "email" as const,
    fuzzy: fieldKey !== "email",
  }));
}

function spreadResolutionToMappedFields(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  mapping: Record<string, number>,
): Map<string, CellResolution> {
  const next = new Map(resolution);
  const identifierFields = ["email", "name", "alternative_name"] as const;
  rowIds.forEach((rowId) => {
    let primary: CellResolution | undefined;
    for (const field of identifierFields) {
      if (mapping[field] == null) continue;
      const cell = resolution.get(cellKey(rowId, field));
      if (cell && cell.status !== "idle") {
        primary = cell;
        break;
      }
    }
    primary ??= resolution.get(cellKey(rowId, "email"));
    if (!primary) return;
    for (const field of identifierFields) {
      if (mapping[field] != null) {
        next.set(cellKey(rowId, field), primary);
      }
    }
  });
  return next;
}

type RematchRequest = {
  mapping: Record<string, number>;
  requestId: number;
  rows: (string | number | null)[][];
  rowIds: string[];
};

export function buildMarkSheetRematchResolution(
  flatRows: (string | number | null)[][],
  rowIds: string[],
  mapping: Record<string, number>,
  matchResults: Record<string, Record<string, import("@/app/client-api/imports").UserMatchResult>>,
): Map<string, CellResolution> {
  const normalizedMapping = normalizeColumnMapping(mapping);
  return spreadResolutionToMappedFields(
    confirmAllExactMatches(
      buildUserMatches(
        flatRows,
        buildMatchSpecs(normalizedMapping),
        ["email", "name", "alternative_name"],
        rowIds,
        matchResults,
        normalizedMapping.name ?? null,
        true,
      ),
    ),
    rowIds,
    normalizedMapping,
  );
}

export function seedMarkSheetRematchResolving(
  rowIds: string[],
  mapping: Record<string, number>,
): Map<string, CellResolution> {
  const normalizedMapping = normalizeColumnMapping(mapping);
  const primaryField = highestPriorityIdentifierField(normalizedMapping);
  if (!primaryField) return new Map();

  const seed = new Map<string, CellResolution>();
  rowIds.forEach((rowId) => {
    seed.set(cellKey(rowId, primaryField), { status: "resolving" });
  });
  return spreadResolutionToMappedFields(seed, rowIds, normalizedMapping);
}

export function createRematchRequestGuard() {
  let latestRequestId = 0;
  return {
    nextRequestId: () => ++latestRequestId,
    shouldApply: (requestId: number) => requestId === latestRequestId,
  };
}

export function extractMatchErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const message = (err as { response?: { data?: { message?: string } } }).response?.data
      ?.message;
    if (message) return String(message);
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Could not match students. Try again.";
}

/** Rows ready for manual match when the match API fails or has not run yet. */
export function seedManualMatchResolution(
  rowIds: string[],
  mapping: Record<string, number>,
): Map<string, CellResolution> {
  const normalizedMapping = normalizeColumnMapping(mapping);
  const primaryField = highestPriorityIdentifierField(normalizedMapping);
  if (!primaryField) return new Map();

  const seed = new Map<string, CellResolution>();
  rowIds.forEach((rowId) => {
    seed.set(cellKey(rowId, primaryField), { status: "new" });
  });
  return spreadResolutionToMappedFields(seed, rowIds, normalizedMapping);
}

/** After a failed rematch, restore snapshot and unblock rows stuck on resolving. */
export function clearResolvingFromResolution(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  mapping: Record<string, number>,
): Map<string, CellResolution> {
  const normalizedMapping = normalizeColumnMapping(mapping);
  const next = new Map(resolution);

  rowIds.forEach((rowId) => {
    for (const field of ["email", "name", "alternative_name"] as const) {
      if (normalizedMapping[field] == null) continue;
      const key = cellKey(rowId, field);
      if (next.get(key)?.status === "resolving") {
        next.set(key, { status: "new" });
      }
    }
  });

  return spreadResolutionToMappedFields(next, rowIds, normalizedMapping);
}

export function MarkSheetImportWizard({
  courseId,
  title,
  rubricTitle,
  onRubricTitleChange,
  onExistingRubricChange,
  year,
  month,
  examDate,
  onComplete,
}: Props) {
  const toast = useToast();
  const pasteGridRef = useRef<MarkSheetPasteGridHandle>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [parsed, setParsed] = useState(false);
  const gridHeight = useContainerHeight(gridContainerRef, [parsed]);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<(string | number | null)[][]>([]);
  const [columns, setColumns] = useState<RubricColumn[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({});
  const [columnRoles, setColumnRoles] = useState<Record<number, ColumnMapRole>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [useExistingRubricId, setUseExistingRubricId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ rubric: { id: number; title: string }; similarity: number }>
  >([]);
  const [rowIds, setRowIds] = useState<string[]>([]);
  const [resolution, setResolution] = useState<Map<string, CellResolution>>(new Map());
  const rematchRequestIdRef = useRef(0);
  const parseSessionRef = useRef(0);
  const resolutionRef = useRef(resolution);
  const resolutionSnapshotRef = useRef<Map<string, CellResolution> | null>(null);
  const columnMappingRef = useRef(columnMapping);
  const columnRolesRef = useRef(columnRoles);
  const columnsRef = useRef(columns);
  resolutionRef.current = resolution;
  columnMappingRef.current = columnMapping;
  columnRolesRef.current = columnRoles;
  columnsRef.current = columns;

  const rosterQuery = useQuery({
    queryKey: ["course-roster", courseId],
    queryFn: () => listCourseRosterStudents(courseId),
    enabled: parsed,
  });

  const setExistingRubric = useCallback(
    (id: number | null) => {
      setUseExistingRubricId(id);
      onExistingRubricChange?.(id);
    },
    [onExistingRubricChange],
  );

  const applyParseResult = useCallback(
    async (
      flatHeaders: string[],
      flatRows: (string | number | null)[][],
      inferred: RubricColumn[],
      mapping: Record<string, number>,
      parseWarnings: string[],
    ) => {
      const parseSession = ++parseSessionRef.current;
      const rematchAtStart = rematchRequestIdRef.current;
      const normalizedMapping = normalizeColumnMapping(mapping);
      const roles = buildColumnRoles(inferred, normalizedMapping);
      setHeaders(flatHeaders);
      setRows(flatRows);
      setColumns(inferred);
      setColumnMapping(normalizedMapping);
      setColumnRoles(roles);
      setWarnings(parseWarnings);
      setParsed(true);
      onRubricTitleChange(title || "untitled rubric");

      const matched = await matchRubrics(courseId, inferred);
      setSuggestions(matched);
      if (matched[0]) {
        setExistingRubric(matched[0].rubric.id);
        onRubricTitleChange(matched[0].rubric.title);
      } else {
        setExistingRubric(null);
      }

      const ids = flatRows.map((_, i) => `row-${i}`);
      setRowIds(ids);
      if (countIdentifierColumns(normalizedMapping) > 0) {
        setResolution(seedMarkSheetRematchResolving(ids, normalizedMapping));
        try {
          const matchResults = await matchMarkSheetStudents(courseId, {
            rows: flatRows,
            column_mapping: normalizedMapping,
          });
          if (
            parseSession !== parseSessionRef.current ||
            rematchRequestIdRef.current !== rematchAtStart
          ) {
            return;
          }
          setResolution(
            buildMarkSheetRematchResolution(flatRows, ids, normalizedMapping, matchResults),
          );
        } catch (err) {
          if (
            parseSession !== parseSessionRef.current ||
            rematchRequestIdRef.current !== rematchAtStart
          ) {
            return;
          }
          setResolution(seedManualMatchResolution(ids, normalizedMapping));
          toast.add({
            title: "Match failed",
            description: extractMatchErrorMessage(err),
          });
        }
      }
    },
    [courseId, onExistingRubricChange, onRubricTitleChange, setExistingRubric, title, toast],
  );

  const parseMutation = useMutation({
    mutationFn: async (input: { file?: File; paste?: string }) => {
      const result = await parseMarkSheetImport(courseId, input);
      const { headers: flatHeaders, rows: flatRows } = flattenTwoRowHeaders(
        result.headers,
        result.rows,
      );
      const inferred =
        result.inferred_columns.length > 0
          ? result.inferred_columns
          : inferImportColumns(flatHeaders, flatRows).columns;
      const mapping =
        result.column_mapping ??
        inferImportColumns(flatHeaders, flatRows).columnMapping;
      const parseWarnings =
        result.warnings ?? inferImportColumns(flatHeaders, flatRows).warnings;
      return { flatHeaders, flatRows, inferred, mapping, parseWarnings };
    },
    onSuccess: ({ flatHeaders, flatRows, inferred, mapping, parseWarnings }) => {
      void applyParseResult(flatHeaders, flatRows, inferred, mapping, parseWarnings);
    },
    onError: () => {
      toast.add({ title: "Import failed", description: "Could not parse the spreadsheet." });
    },
  });

  const rematchMutation = useMutation({
    mutationFn: async ({ mapping, requestId, rows: reqRows }: RematchRequest) => {
      const normalizedMapping = normalizeColumnMapping(mapping);
      const matchResults = await matchMarkSheetStudents(courseId, {
        rows: reqRows,
        column_mapping: normalizedMapping,
      });
      return { matchResults, mapping: normalizedMapping, requestId };
    },
    onSuccess: ({ matchResults, mapping, requestId }, variables) => {
      if (requestId !== rematchRequestIdRef.current) return;
      resolutionSnapshotRef.current = null;
      setResolution(
        buildMarkSheetRematchResolution(
          variables.rows,
          variables.rowIds,
          mapping,
          matchResults,
        ),
      );
    },
    onError: (err, variables) => {
      if (variables.requestId !== rematchRequestIdRef.current) return;
      const snapshot = resolutionSnapshotRef.current;
      if (snapshot) {
        setResolution(
          clearResolvingFromResolution(snapshot, variables.rowIds, variables.mapping),
        );
      } else {
        setResolution(
          clearResolvingFromResolution(
            resolutionRef.current,
            variables.rowIds,
            variables.mapping,
          ),
        );
      }
      resolutionSnapshotRef.current = null;
      toast.add({
        title: "Match failed",
        description: extractMatchErrorMessage(err),
      });
    },
  });

  const handleColumnRoleChange = useCallback(
    (colIndex: number, role: ColumnMapRole) => {
      const prevMapping = columnMappingRef.current;
      const nextRoles = { ...columnRolesRef.current, [colIndex]: role };
      const nextMapping = applyColumnMapRole(role, colIndex, prevMapping);
      const nextColumns = columnsFromRoles(headers, nextRoles, columnsRef.current);

      columnRolesRef.current = nextRoles;
      columnMappingRef.current = nextMapping;
      columnsRef.current = nextColumns;

      setColumnRoles(nextRoles);
      setColumnMapping(nextMapping);
      setColumns(nextColumns);

      if (!shouldRematchOnRoleChange(prevMapping, colIndex, nextMapping, role)) {
        return;
      }

      resolutionSnapshotRef.current = new Map(resolutionRef.current);
      setResolution(seedMarkSheetRematchResolving(rowIds, nextMapping));
      const requestId = ++rematchRequestIdRef.current;
      rematchMutation.mutate({
        mapping: normalizeColumnMapping(nextMapping),
        requestId,
        rows,
        rowIds,
      });
    },
    [headers, rematchMutation, rowIds, rows],
  );

  const handleMaxMarksChange = useCallback((colKey: string, maxMarks: number | null) => {
    setColumns((prev) =>
      prev.map((col) =>
        col.key === colKey
          ? { ...col, ...(maxMarks != null ? { max_marks: maxMarks } : {}) }
          : col,
      ),
    );
  }, []);

  const commitMutation = useMutation({
    mutationFn: async () => {
      const scoreCols = columns.filter((c) => c.kind === "score");
      const scoreKeys = scoreCols.map((c) => c.key);
      const scoreColIndexByKey = new Map<string, number>();
      scoreCols.forEach((col) => {
        const headerIdx = headers.findIndex((h) => h === col.title);
        scoreColIndexByKey.set(col.key, headerIdx >= 0 ? headerIdx : col.sort_order);
      });

      const { rows: importRows, unresolvedRowIndexes } = buildMarkSheetImportRows({
        rows,
        rowIds,
        resolution,
        columnMapping,
        scoreColIndexByKey,
        scoreKeys,
      });

      if (unresolvedRowIndexes.length > 0) {
        throw new Error("Unresolved student matches remain.");
      }

      return commitMarkSheetImport(courseId, {
        title: title || rubricTitle,
        year,
        month,
        exam_date: examDate,
        rubric_id: useExistingRubricId ?? undefined,
        rubric: useExistingRubricId
          ? undefined
          : { title: rubricTitle, columns: scoreCols },
        rows: importRows,
      });
    },
    onSuccess: (sheet) => onComplete(sheet.id),
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "response" in err
          ? String((err as { response?: { data?: { message?: string } } }).response?.data?.message)
          : "Could not save mark sheet.";
      toast.add({ title: "Save failed", description: message });
    },
  });

  const unresolvedCount = countUnresolvedMarkSheetRows(
    resolution,
    rowIds,
    columnMapping,
  );
  const unmatchedCount = countUnmatchedMarkSheetRows(
    resolution,
    rowIds,
    columnMapping,
  );
  const resolvedGridHeight = useMemo(
    () =>
      resolveMarkSheetGridHeight({
        rowCount: Math.max(rows.length, 1),
        // After parse, rubric/matching panels sit below — don't shrink to flex slot.
        containerHeight: parsed ? 0 : gridHeight,
        viewportHeight,
        reserveBelow: parsed ? MARK_SHEET_REVIEW_PANELS_RESERVE : 0,
      }),
    [parsed, rows.length, gridHeight, viewportHeight],
  );

  const tryParseFromGrid = useCallback(
    (options?: { showEmptyToast?: boolean }) => {
      if (parseMutation.isPending) return;
      const paste = pasteGridRef.current?.getPastePayload();
      if (!paste) {
        if (options?.showEmptyToast) {
          toast.add({ description: "Add a header row and at least one data row." });
        }
        return;
      }
      parseMutation.mutate({ paste });
    },
    [parseMutation, toast],
  );

  const debouncedAutoParse = useDebouncedCallback(() => {
    tryParseFromGrid();
  }, 400);

  const scoreColumnSummary = useMemo(
    () => columns.filter((c) => c.kind === "score"),
    [columns],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {!parsed ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div ref={gridContainerRef} className="flex min-h-60 flex-1 flex-col">
            <MarkSheetPasteGrid
              ref={pasteGridRef}
              className="h-full"
              height={resolvedGridHeight}
              isParsing={parseMutation.isPending}
              onPasteApplied={debouncedAutoParse}
              onFileSelected={(file) => parseMutation.mutate({ file })}
            />
          </div>
          <Button
            onClick={() => tryParseFromGrid({ showEmptyToast: true })}
            disabled={parseMutation.isPending}
            isLoading={parseMutation.isPending}
            className="shrink-0 self-start"
          >
            Parse spreadsheet
          </Button>
        </div>
      ) : (
        <>
          <div
            ref={gridContainerRef}
            className="flex shrink-0 flex-col"
            style={{ minHeight: resolvedGridHeight }}
          >
            <MarkSheetImportGrid
              headers={headers}
              rows={rows}
              columns={columns}
              columnMapping={columnMapping}
              columnRoles={columnRoles}
              resolution={resolution}
              rowIds={rowIds}
              rosterStudents={rosterQuery.data ?? []}
              warnings={warnings}
              height={resolvedGridHeight}
              onColumnRoleChange={handleColumnRoleChange}
              onMaxMarksChange={handleMaxMarksChange}
              onResolutionChange={setResolution}
            />
          </div>

          <section className="space-y-2">
            <h2 className="font-medium">Rubric</h2>
            {suggestions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-text-secondary text-sm">
                  Suggested match: {suggestions[0]?.rubric.title} (
                  {Math.round((suggestions[0]?.similarity ?? 0) * 100)}% similar)
                </p>
                <Select
                  autoComplete="off"
                  items={[
                    ...suggestions.map((s) => ({
                      value: String(s.rubric.id),
                      label: `${s.rubric.title} (${Math.round(s.similarity * 100)}%)`,
                    })),
                    { value: "new", label: "Create new rubric" },
                  ]}
                  value={useExistingRubricId ? String(useExistingRubricId) : "new"}
                  onValueChange={(value) => {
                    if (value === "new") {
                      setExistingRubric(null);
                    } else {
                      const id = Number(value);
                      setExistingRubric(id);
                      const chosen = suggestions.find((s) => s.rubric.id === id);
                      if (chosen) onRubricTitleChange(chosen.rubric.title);
                    }
                  }}
                />
              </div>
            ) : null}
            {!useExistingRubricId && scoreColumnSummary.length > 0 ? (
              <ul className="text-text-secondary list-inside list-disc text-sm">
                {scoreColumnSummary.map((c) => (
                  <li key={c.key}>
                    {c.title}
                    {c.max_marks != null ? ` /${c.max_marks}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Student matching</h2>
            <UserMatchesPanel
              pendingExactCount={countPendingExactMatches(resolution, rowIds, columnMapping)}
              pendingFuzzyCount={countPendingFuzzyMatches(resolution, rowIds, columnMapping)}
              pendingNameMismatchCount={countPendingNameMismatches(
                resolution,
                rowIds,
                columnMapping,
              )}
              unmatchedCount={unmatchedCount}
              onConfirmAllExact={() => setResolution(confirmAllExactMatches(resolution))}
            />
          </section>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setParsed(false);
                setHeaders([]);
                setRows([]);
              }}
            >
              Paste again
            </Button>
            <Button
              onClick={() => commitMutation.mutate()}
              disabled={unresolvedCount > 0 || commitMutation.isPending}
              isLoading={commitMutation.isPending}
            >
              {unresolvedCount > 0
                ? `Resolve ${unresolvedCount} student row${unresolvedCount === 1 ? "" : "s"} first`
                : "Save mark sheet"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
