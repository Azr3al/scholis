"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Button, Tooltip, TooltipProvider, buttonVariants } from "@/components/primitives";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { WarningCircle as AlertCircle } from "iconoir-react";
import type { DataEditorRef, Item } from "@glideapps/glide-data-grid";

import {
  commitImport,
  getImportMicrosoftJob,
  type CommitError,
} from "@/app/client-api/imports";
import {
  CoursePickerPopover,
  type CoursePickerTarget,
} from "@/components/import-grid/course-picker-popover";
import {
  UserMatchPopover,
  type UserMatchTarget,
} from "@/components/import-grid/user-match-popover";
import {
  ImportDataGrid,
  type ImportGridFocusTarget,
} from "@/components/import-grid/import-data-grid";
import { ValidationErrorsPanel } from "@/components/import-grid/validation-errors-panel";
import {
  LinkNoticeBar,
  type LinkNotice,
} from "@/components/import-grid/link-notice-bar";
import { useImportFields } from "@/hooks/imports/use-import-fields";
import { useResolution } from "@/hooks/imports/use-resolution";
import useImportStore from "@/store/import-store";
import {
  buildCommitRowIndexMap,
  buildCommitRows,
} from "@/lib/imports/commit-payload";
import {
  collectClientErrors,
  mapServerCommitErrors,
  mergeValidationErrors,
  type ImportValidationError,
} from "@/lib/imports/validation-errors";
import {
  cellKey,
  collectUnresolvedCourseTokens,
  computeCourseProgress,
  confirmAllExactMatches,
  countPendingExactMatches,
  countPendingFuzzyMatches,
  countPendingNameMismatches,
  detectCourseConflicts,
  groupDuplicateEmails,
  hasUnresolvedUserMatches,
  propagateCoursePick,
  resolveDuplicateEmails,
  type CourseToken,
} from "@/lib/imports/resolution";
import { NeedsAttentionPanel } from "@/components/import-grid/needs-attention-panel";
import { UserMatchesPanel } from "@/components/import-grid/user-matches-panel";
import { DuplicateEmailsPanel } from "@/components/import-wizard/duplicate-emails-panel";
import { ImportCourseScopeSummary } from "@/components/import-grid/import-course-scope-summary";
import { PasteImportRowPanel } from "@/components/import-wizard/paste-import-row-panel";
import {
  emailMappedColumn,
  nameMappedColumn,
  splitCourseTokens,
} from "@/lib/imports/wizard-logic";
import { resolveImportRowIndices } from "@/lib/imports/resolve-import-rows";
import {
  remapSourceRowIndex,
  remapValidationErrors,
} from "@/lib/imports/remap-source-rows";
import { MicrosoftCreateToggle } from "@/components/microsoft/microsoft-create-toggle";
import {
  SHEET_FULLSCREEN_TOP_BAR_HEIGHT_PX,
  SheetFullscreenShell,
} from "@/components/layout/sheet-fullscreen-shell";
import { ImportFullscreenDock } from "@/components/import-wizard/import-fullscreen-dock";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useTenant } from "@/hooks/useTenant";
import { IMPORT_DEFAULT_PASSWORD } from "@/lib/imports/default-password";

function extractCommitErrors(err: unknown): CommitError[] {
  if (!axios.isAxiosError(err)) return [];
  const details = err.response?.data?.details;
  if (
    details &&
    typeof details === "object" &&
    Array.isArray((details as { errors?: unknown }).errors)
  ) {
    return (details as { errors: CommitError[] }).errors;
  }
  return [];
}

const MS_JOB_DONE = new Set(["succeeded", "partial", "failed"]);

function ImportMicrosoftProvisioningStatus({
  jobId,
  msTenant,
}: {
  jobId: number;
  msTenant: boolean;
}) {
  const { data: job, isError } = useQuery({
    queryKey: ["import-microsoft-job", jobId],
    queryFn: () => getImportMicrosoftJob(jobId),
    refetchInterval: (data) => {
      if (data && MS_JOB_DONE.has(data.status)) return false;
      return 2000;
    },
  });
  const isRunning = job != null && !MS_JOB_DONE.has(job.status);
  const isDone = job != null && MS_JOB_DONE.has(job.status);

  if (isError) {
    return (
      <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
        Could not load provisioning status — accounts may still be creating in
        the background.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
        {isRunning || job == null ? (
          <Spinner className="h-3.5 w-3.5 shrink-0 " aria-hidden />
        ) : null}
        {job == null
          ? "Microsoft accounts: provisioning…"
          : `Microsoft accounts: ${job.succeeded} created${
              job.skipped > 0 ? `, ${job.skipped} skipped` : ""
            }${job.failed > 0 ? `, ${job.failed} failed` : ""}${
              isRunning ? " (in progress…)" : ""
            }`}
      </p>
      {msTenant && isDone && job.succeeded > 0 ? (
        <p className="text-sm text-green-800 dark:text-green-200">
          Users can sign in with Microsoft using password{" "}
          <strong>{IMPORT_DEFAULT_PASSWORD}</strong>.
        </p>
      ) : null}
    </div>
  );
}

export function ReviewStep() {
  useResolution();
  const { tenant } = useTenant();
  const { effectiveFullscreen, setAvailability } = useFullscreen();
  const parse = useImportStore((s) => s.parse);
  const rowIds = useImportStore((s) => s.rowIds);
  const resolution = useImportStore((s) => s.resolution);
  const mapping = useImportStore((s) => s.mapping);
  const role = useImportStore((s) => s.role);
  const fieldDefaults = useImportStore((s) => s.fieldDefaults);
  const sendWelcomeEmails = useImportStore((s) => s.sendWelcomeEmails);
  const setSendWelcomeEmails = useImportStore((s) => s.setSendWelcomeEmails);
  const duplicateEmailStrategy = useImportStore((s) => s.duplicateEmailStrategy);
  const setDuplicateEmailStrategy = useImportStore((s) => s.setDuplicateEmailStrategy);
  const appendParsedRows = useImportStore((s) => s.appendParsedRows);
  const removeParsedRows = useImportStore((s) => s.removeParsedRows);
  const mergeResolutions = useImportStore((s) => s.mergeResolutions);
  const setCellResolution = useImportStore((s) => s.setCellResolution);
  const reset = useImportStore((s) => s.reset);
  const setStep = useImportStore((s) => s.setStep);

  const { data: fields = [] } = useImportFields(role, Boolean(parse));

  const [pickerTarget, setPickerTarget] = useState<CoursePickerTarget | null>(
    null,
  );
  const [userMatchTarget, setUserMatchTarget] = useState<UserMatchTarget | null>(
    null,
  );
  const importGridRef = useRef<DataEditorRef>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [validationPanelCollapsed, setValidationPanelCollapsed] = useState(false);
  const [notice, setNotice] = useState<LinkNotice | null>(null);
  const [serverErrors, setServerErrors] = useState<ImportValidationError[]>([]);
  const [focusTarget, setFocusTarget] = useState<ImportGridFocusTarget | null>(
    null,
  );
  const [sessionErrorCount, setSessionErrorCount] = useState(0);
  const [fullscreenGridHeight, setFullscreenGridHeight] = useState(700);

  const focusGridCell = useCallback(
    (sourceRow: number, field: string) => {
      setFocusTarget({ sourceRow, field, requestId: Date.now() });
    },
    [],
  );

  const emailColIndex = useMemo(() => emailMappedColumn(mapping), [mapping]);
  const nameColIndex = useMemo(() => nameMappedColumn(mapping), [mapping]);

  const firstMappedField = useMemo(() => {
    const entries = Object.entries(mapping)
      .filter(([, field]) => field)
      .sort(([a], [b]) => Number(a) - Number(b));
    return entries[0]?.[1] ?? "email";
  }, [mapping]);

  const duplicateEmailResolution = useMemo(() => {
    if (!parse || emailColIndex === null) return null;
    const groups = groupDuplicateEmails(parse.rows, emailColIndex);
    if (groups.size === 0) return null;
    return resolveDuplicateEmails({
      strategy: duplicateEmailStrategy,
      rows: parse.rows,
      emailColIndex,
      rowIds,
      resolution,
    });
  }, [parse, emailColIndex, duplicateEmailStrategy, rowIds, resolution]);

  const skippedRows = useMemo(
    () => duplicateEmailResolution?.skippedRowIndices ?? new Set<number>(),
    [duplicateEmailResolution],
  );

  const clientErrors = useMemo(() => {
    if (!parse) return [];
    const base = collectClientErrors({
      rows: parse.rows,
      mapping,
      fields,
      skippedRows,
    });
    const emailErrors: ImportValidationError[] = [];
    rowIds.forEach((rid, rowIndex) => {
      if (skippedRows.has(rowIndex)) return;
      const cell = resolution.get(cellKey(rid, "email"));
      if (cell?.status === "error") {
        emailErrors.push({
          sourceRow: rowIndex,
          field: "email",
          reason: "Invalid email format",
          origin: "client",
        });
      }
    });
    return mergeValidationErrors(base, emailErrors);
  }, [parse, mapping, fields, skippedRows, rowIds, resolution]);

  const validationErrors = useMemo(
    () => mergeValidationErrors(clientErrors, serverErrors),
    [clientErrors, serverErrors],
  );

  const enrollmentCount = useMemo(() => {
    let total = 0;
    const skippedRows = duplicateEmailResolution?.skippedRowIndices ?? new Set<number>();
    rowIds.forEach((rid, rowIndex) => {
      if (skippedRows.has(rowIndex)) return;
      const cell = resolution.get(cellKey(rid, "courses"));
      cell?.tokens?.forEach((t) => {
        if (t.status === "linked" && t.match) total += 1;
      });
    });
    duplicateEmailResolution?.mergedCourseIdsByRow.forEach((ids) => {
      total += ids.length;
    });
    return total;
  }, [resolution, rowIds, duplicateEmailResolution]);

  const summary = useMemo(() => {
    let confirmedMatches = 0;
    let pendingMatches = 0;
    let newUsers = 0;
    let needsAttention = 0;
    const skippedRows = duplicateEmailResolution?.skippedRowIndices ?? new Set<number>();
    resolution.forEach((cell, key) => {
      if (!key.endsWith(":email")) return;
      const rowId = key.split(":")[0];
      const rowIndex = rowIds.indexOf(rowId);
      if (rowIndex >= 0 && skippedRows.has(rowIndex)) return;
      if (cell.status === "confirmed" && cell.entityRef) confirmedMatches += 1;
      if (cell.status === "pending_match" || cell.status === "pending_candidates") {
        pendingMatches += 1;
      }
      if (cell.status === "new") newUsers += 1;
      if (cell.status === "needs_attention") needsAttention += 1;
    });
    return { confirmedMatches, pendingMatches, newUsers, needsAttention };
  }, [resolution, rowIds, duplicateEmailResolution]);

  const coursesColIndex = useMemo(() => {
    const entry = Object.entries(mapping).find(([, f]) => f === "courses");
    return entry ? Number(entry[0]) : -1;
  }, [mapping]);

  const activeRowIds = useMemo(() => {
    const skippedRows = duplicateEmailResolution?.skippedRowIndices ?? new Set<number>();
    return rowIds.filter((_, rowIndex) => !skippedRows.has(rowIndex));
  }, [rowIds, duplicateEmailResolution]);

  const unresolvedGroups = useMemo(
    () => collectUnresolvedCourseTokens(resolution, activeRowIds),
    [resolution, activeRowIds],
  );
  const courseProgress = useMemo(
    () => computeCourseProgress(resolution, activeRowIds),
    [resolution, activeRowIds],
  );
  const conflicts = useMemo(
    () => detectCourseConflicts(resolution, activeRowIds),
    [resolution, activeRowIds],
  );

  const allResolved = unresolvedGroups.length === 0;
  const unresolvedUserMatches = hasUnresolvedUserMatches(resolution, activeRowIds);
  const pendingExactCount = countPendingExactMatches(resolution, activeRowIds);
  const pendingFuzzyCount = countPendingFuzzyMatches(resolution, activeRowIds);
  const pendingNameMismatchCount = countPendingNameMismatches(
    resolution,
    activeRowIds,
  );
  const skippedDuplicateRows = duplicateEmailResolution?.skippedRowIndices.size ?? 0;
  const duplicateEmailCount = duplicateEmailResolution?.duplicateGroups.size ?? 0;

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!parse) throw new Error("No data");
      const rows = buildCommitRows({
        rows: parse.rows,
        rowIds,
        mapping,
        fields,
        fieldDefaults,
        resolution,
        duplicateResolution: duplicateEmailResolution ?? undefined,
        duplicateStrategy: duplicateEmailStrategy,
      });
      return commitImport(role, rows, duplicateEmailStrategy, sendWelcomeEmails);
    },
  });

  const handlePasteRowsAdded = useCallback(
    async (rows: (string | null)[][]) => {
      appendParsedRows(rows);
      const indices = rows.map((_, i) => i);
      await resolveImportRowIndices(
        indices,
        () => useImportStore.getState(),
        mergeResolutions,
      );
      focusGridCell(
        0,
        emailColIndex !== null ? "email" : firstMappedField,
      );
      if (commitMutation.isError) commitMutation.reset();
    },
    [
      appendParsedRows,
      mergeResolutions,
      focusGridCell,
      emailColIndex,
      firstMappedField,
      commitMutation,
    ],
  );

  const handleRowsRemove = useCallback(
    (sourceIndices: number[]) => {
      if (!parse || sourceIndices.length === 0) return;
      if (parse.rows.length - sourceIndices.length < 1) return;

      const removedRowIds = new Set(
        sourceIndices.map((i) => rowIds[i]).filter(Boolean),
      );

      removeParsedRows(sourceIndices);
      setServerErrors((prev) => remapValidationErrors(prev, sourceIndices));
      setFocusTarget((prev) => {
        if (!prev) return null;
        const nextRow = remapSourceRowIndex(prev.sourceRow, sourceIndices);
        if (nextRow === null) return null;
        return { ...prev, sourceRow: nextRow, requestId: Date.now() };
      });
      setPickerTarget((prev) =>
        prev && removedRowIds.has(prev.rowId) ? null : prev,
      );
      if (commitMutation.isError) commitMutation.reset();
    },
    [parse, rowIds, removeParsedRows, commitMutation],
  );

  const gridRemoveProps = {
    onRowsRemove: handleRowsRemove,
    removeDisabled:
      commitMutation.isLoading || commitMutation.isSuccess || !parse,
  };

  const importDisabledReason = useMemo(() => {
    if (unresolvedUserMatches) {
      return "Confirm or reject all user matches before importing";
    }
    if (unresolvedGroups.length > 0) {
      return `Resolve ${unresolvedGroups.length} remaining course value${unresolvedGroups.length === 1 ? "" : "s"}`;
    }
    if (validationErrors.length > 0) {
      return `Fix ${validationErrors.length} error${validationErrors.length === 1 ? "" : "s"}`;
    }
    if (commitMutation.isLoading) return "Import in progress…";
    return null;
  }, [
    unresolvedUserMatches,
    unresolvedGroups.length,
    validationErrors.length,
    commitMutation.isLoading,
  ]);

  useEffect(() => {
    if (!commitMutation.isError || !parse) return;
    const raw = extractCommitErrors(commitMutation.error);
    if (raw.length === 0) return;
    const rowIndexMap = buildCommitRowIndexMap({
      rows: parse.rows,
      duplicateResolution: duplicateEmailResolution ?? undefined,
    });
    const mapped = mapServerCommitErrors(raw, rowIndexMap);
    setServerErrors(mapped);
    focusGridCell(mapped[0].sourceRow, mapped[0].field);
    setValidationPanelCollapsed(false);
  }, [commitMutation.isError, commitMutation.error, parse, duplicateEmailResolution, focusGridCell]);

  useEffect(() => {
    if (validationErrors.length > sessionErrorCount) {
      setSessionErrorCount(validationErrors.length);
    }
  }, [validationErrors.length, sessionErrorCount]);

  useEffect(() => {
    if (validationErrors.length > 0) {
      setValidationPanelCollapsed(false);
    }
  }, [validationErrors.length]);

  useEffect(() => {
    if (commitMutation.isSuccess) {
      setServerErrors([]);
      setSessionErrorCount(0);
      setFocusTarget(null);
    }
  }, [commitMutation.isSuccess]);

  useEffect(() => {
    setPanelCollapsed(allResolved);
  }, [allResolved]);

  useEffect(() => {
    setAvailability({
      enabled: Boolean(parse) && !commitMutation.isSuccess,
      label: "Import fullscreen",
    });

    return () => {
      setAvailability({ enabled: false });
    };
  }, [parse, commitMutation.isSuccess, setAvailability]);

  useEffect(() => {
    const updateHeight = () => {
      setFullscreenGridHeight(
        Math.max(420, window.innerHeight - SHEET_FULLSCREEN_TOP_BAR_HEIGHT_PX),
      );
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const handleCellEdited = useCallback(
    (sourceRow: number, field: string) => {
      setServerErrors((prev) =>
        prev.filter(
          (e) => !(e.sourceRow === sourceRow && e.field === field),
        ),
      );
      if (commitMutation.isError) commitMutation.reset();
    },
    [commitMutation],
  );

  const handleConfirmAllExact = useCallback(() => {
    const next = confirmAllExactMatches(useImportStore.getState().resolution);
    useImportStore.setState({ resolution: next });
  }, []);

  const handleUserMatchResolve = useCallback(
    (next: import("@/lib/imports/resolution").CellResolution) => {
      const target = userMatchTarget;
      if (!target) return;
      setCellResolution(cellKey(rowIds[target.sourceRow], "email"), next);
    },
    [userMatchTarget, rowIds, setCellResolution],
  );

  if (!parse) return null;

  const handleCellActivated = (
    item: Item,
    bounds: { x: number; y: number; width: number; height: number } | null,
    field: string,
    sourceRow: number,
  ) => {
    if (field === "email" && bounds) {
      const emailCell = resolution.get(cellKey(rowIds[sourceRow], "email"));
      if (
        emailCell &&
        (emailCell.status === "pending_match" || emailCell.status === "pending_candidates")
      ) {
        const raw = parse?.rows[sourceRow]?.[emailColIndex ?? -1];
        const rawEmail =
          raw === null || raw === undefined ? "" : String(raw).trim();
        const rawName =
          nameColIndex != null ? parse?.rows[sourceRow]?.[nameColIndex] : null;
        const importedName =
          rawName === null || rawName === undefined
            ? undefined
            : String(rawName).trim() || undefined;
        setUserMatchTarget({
          sourceRow,
          anchorCol: item[0],
          anchorRow: item[1],
          rawEmail,
          importedName,
          rect: bounds,
          cell: emailCell,
        });
        return;
      }
    }

    if (field !== "courses" || !bounds) return;

    const mapped = Object.entries(useImportStore.getState().mapping)
      .filter(([, f]) => f)
      .map(([idx, mappedField]) => ({
        idx: Number(idx),
        field: mappedField as string,
      }));
    const coursesMapping = mapped.find((entry) => entry.field === "courses");
    if (!coursesMapping) return;

    const cell = resolution.get(cellKey(rowIds[sourceRow], "courses"));
    const raw = parse.rows[sourceRow]?.[coursesMapping.idx];
    const tokens: CourseToken[] = cell?.tokens?.length
      ? cell.tokens
      : splitCourseTokens(raw ?? null).map((t) => ({
          raw: t,
          status: "needs_attention" as const,
          match: null,
          candidates: [],
        }));

    const actionable =
      tokens.find(
        (t) => t.status === "needs_attention" || t.status === "none",
      ) ?? tokens.find((t) => t.status === "linked");
    if (!actionable) return;

    let affectedRows = 0;
    rowIds.forEach((rid) => {
      const c = resolution.get(cellKey(rid, "courses"));
      if (
        c?.tokens?.some(
          (t) => t.raw === actionable.raw && t.origin !== "manual",
        )
      ) {
        affectedRows += 1;
      }
    });

    setPickerTarget({
      rowId: rowIds[sourceRow],
      tokenRaw: actionable.raw,
      rect: bounds,
      candidates: actionable.candidates,
      affectedRows,
    });
  };

  const canImport =
    allResolved &&
    !unresolvedUserMatches &&
    validationErrors.length === 0 &&
    !commitMutation.isLoading &&
    !commitMutation.isSuccess;

  const summaryText = `${parse.rowCount} rows · ${summary.newUsers} new · ${summary.confirmedMatches} confirmed updates · ${enrollmentCount} enrollments${
    summary.pendingMatches > 0
      ? ` · ${summary.pendingMatches} match${summary.pendingMatches === 1 ? "" : "es"} pending`
      : ""
  }${
    validationErrors.length > 0
      ? ` · ${validationErrors.length} error${validationErrors.length === 1 ? "" : "s"}`
      : ""
  }${
    skippedDuplicateRows > 0
      ? ` · ${skippedDuplicateRows} row${skippedDuplicateRows === 1 ? "" : "s"} skipped (${duplicateEmailCount} duplicate email${duplicateEmailCount === 1 ? "" : "s"})`
      : ""
  }${
    summary.needsAttention > 0
      ? ` · ${summary.needsAttention} need attention`
      : ""
  }`;

  const importAction = (
    <Tooltip.Root>
      <Tooltip.Trigger render={<span>
          <Button
            type="button"
            disabled={!canImport}
            aria-busy={commitMutation.isLoading || undefined}
            onClick={() => commitMutation.mutate()}
          >
            {commitMutation.isLoading ? (
              <>
                <Spinner className="size-4" aria-hidden />
                Importing…
              </>
            ) : (
              "Import"
            )}
          </Button>
        </span>} />
      {importDisabledReason ? (
        <Tooltip.Portal>
        <Tooltip.Positioner>
        <Tooltip.Popup>{importDisabledReason}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
      ) : null}
    </Tooltip.Root>
  );

  const handleCoursePick = (
    tokenRaw: string,
    rowId: string,
    choice: { id: number; title: string } | null,
  ) => {
    if (coursesColIndex < 0) return;
    const { next, affected, snapshot } = propagateCoursePick(
      resolution,
      parse.rows,
      coursesColIndex,
      rowIds,
      rowId,
      tokenRaw,
      choice,
    );
    useImportStore.getState().mergeResolutions(next);
    if (choice && affected.length > 1) {
      setNotice({
        id: Date.now(),
        tokenRaw,
        count: affected.length,
        onUndo: () => {
          const current = useImportStore.getState().resolution;
          const restored = new Map(current);
          snapshot.forEach((v, k) => restored.set(k, v));
          useImportStore.setState({ resolution: restored });
        },
      });
    }
    setPickerTarget(null);
  };

  const sidePanelContent = (
    <>
      <UserMatchesPanel
        pendingExactCount={pendingExactCount}
        pendingFuzzyCount={pendingFuzzyCount}
        pendingNameMismatchCount={pendingNameMismatchCount}
        onConfirmAllExact={handleConfirmAllExact}
      />
      <ValidationErrorsPanel
        errors={validationErrors}
        fields={fields}
        initialCount={sessionErrorCount}
        collapsed={validationPanelCollapsed}
        focusTarget={focusTarget}
        onToggleCollapsed={() => setValidationPanelCollapsed((c) => !c)}
        onFocusError={(err) => focusGridCell(err.sourceRow, err.field)}
      />
      <NeedsAttentionPanel
        groups={unresolvedGroups}
        conflicts={conflicts}
        progress={courseProgress}
        collapsed={panelCollapsed}
        onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
        onResolve={(group, rect) => {
          const firstRow = rowIds.find((rid) =>
            resolution
              .get(cellKey(rid, "courses"))
              ?.tokens?.some(
                (t) => t.raw === group.raw && t.origin !== "manual",
              ),
          );
          if (!firstRow) return;
          setPickerTarget({
            rowId: firstRow,
            tokenRaw: group.raw,
            rect,
            candidates: group.candidates,
            affectedRows: group.count,
          });
        }}
      />
    </>
  );

  if (effectiveFullscreen && !commitMutation.isSuccess) {
    return (
      <>
        <SheetFullscreenShell
          layout="grid-first"
          title="Import"
          summary={summaryText}
          actions={importAction}
          dock={
            <ImportFullscreenDock
              newUserCount={summary.newUsers}
              sendWelcomeEmails={sendWelcomeEmails}
              onSendWelcomeEmailsChange={setSendWelcomeEmails}
              showCourseScope={coursesColIndex >= 0}
              onCourseScopeChange={() => setStep("map")}
              duplicateEmailResolution={duplicateEmailResolution}
              duplicateEmailStrategy={duplicateEmailStrategy}
              onDuplicateEmailStrategyChange={setDuplicateEmailStrategy}
              validationErrors={validationErrors}
              fields={fields}
              sessionErrorCount={sessionErrorCount}
              validationPanelCollapsed={validationPanelCollapsed}
              onValidationPanelToggle={() =>
                setValidationPanelCollapsed((c) => !c)
              }
              focusTarget={focusTarget}
              onFocusError={(err) => focusGridCell(err.sourceRow, err.field)}
              unresolvedGroups={unresolvedGroups}
              conflicts={conflicts}
              courseProgress={courseProgress}
              panelCollapsed={panelCollapsed}
              onPanelToggle={() => setPanelCollapsed((c) => !c)}
              pendingExactMatchCount={pendingExactCount}
              pendingFuzzyMatchCount={pendingFuzzyCount}
              onConfirmAllExactMatches={handleConfirmAllExact}
              onResolve={(group, rect) => {
                const firstRow = rowIds.find((rid) =>
                  resolution
                    .get(cellKey(rid, "courses"))
                    ?.tokens?.some(
                      (t) => t.raw === group.raw && t.origin !== "manual",
                    ),
                );
                if (!firstRow) return;
                setPickerTarget({
                  rowId: firstRow,
                  tokenRaw: group.raw,
                  rect,
                  candidates: group.candidates,
                  affectedRows: group.count,
                });
              }}
              pasteHeaders={parse.headers}
              onPasteRowsAdded={handlePasteRowsAdded}
              pasteDisabled={commitMutation.isLoading}
            />
          }
          main={
            <ImportDataGrid
              ref={importGridRef}
              duplicateResolution={duplicateEmailResolution}
              validationErrors={validationErrors}
              focusTarget={focusTarget}
              onCellActivated={handleCellActivated}
              onCellEdited={handleCellEdited}
              height={fullscreenGridHeight}
              className="h-full rounded-none border-0"
              {...gridRemoveProps}
            />
          }
        />
        <LinkNoticeBar notice={notice} onDismiss={dismissNotice} />
        <CoursePickerPopover
          target={pickerTarget}
          onClose={() => setPickerTarget(null)}
          onPick={handleCoursePick}
        />
        <UserMatchPopover
          target={userMatchTarget}
          gridRef={importGridRef}
          onClose={() => setUserMatchTarget(null)}
          onResolve={handleUserMatchResolve}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {commitMutation.isSuccess ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
          <p className="font-medium text-green-900 dark:text-green-100">
            Import complete
          </p>
          <p className="mt-1 text-sm text-green-800 dark:text-green-200">
            {commitMutation.data.created} created · {commitMutation.data.updated}{" "}
            updated · {commitMutation.data.enrolled} enrolled
          </p>
          {commitMutation.data.created > 0 ? (
            <p className="mt-2 text-sm text-green-800 dark:text-green-200">
              Default password for new users:{" "}
              <strong>{IMPORT_DEFAULT_PASSWORD}</strong>
              {tenant?.is_microsoft_on
                ? ". Wait for Microsoft provisioning below, then sign in with Microsoft using this password."
                : "."}
            </p>
          ) : null}
          {commitMutation.data.microsoft_job_id != null ? (
            <ImportMicrosoftProvisioningStatus
              jobId={commitMutation.data.microsoft_job_id}
              msTenant={Boolean(tenant?.is_microsoft_on)}
            />
          ) : null}
          <Button className="mt-3" type="button" variant="secondary" onClick={() => reset()}>
            Import another file
          </Button>
        </div>
      ) : null}

      {serverErrors.length > 0 && !commitMutation.isSuccess ? (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-50 dark:bg-red-950/40">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              Import aborted — nothing was saved
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Fix the highlighted cells in the grid, then Import again.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{summaryText}</p>
        {importAction}
      </div>

      {summary.newUsers > 0 && !commitMutation.isSuccess && (
        <MicrosoftCreateToggle
          checked={sendWelcomeEmails}
          onChange={setSendWelcomeEmails}
          title="Send welcome emails"
          description={`Send login instructions to ${summary.newUsers} newly created user${summary.newUsers === 1 ? "" : "s"} when import completes. Existing linked users are not emailed.`}
        />
      )}

      {duplicateEmailResolution && !commitMutation.isSuccess ? (
        <DuplicateEmailsPanel
          resolution={duplicateEmailResolution}
          strategy={duplicateEmailStrategy}
          onStrategyChange={setDuplicateEmailStrategy}
        />
      ) : null}

      {coursesColIndex >= 0 && !commitMutation.isSuccess ? (
        <ImportCourseScopeSummary onChange={() => setStep("map")} />
      ) : null}

      {!commitMutation.isSuccess ? (
        <PasteImportRowPanel
          headers={parse.headers}
          disabled={commitMutation.isLoading}
          onRowsAdded={handlePasteRowsAdded}
        />
      ) : null}

      {!commitMutation.isSuccess ? (
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <ImportDataGrid
              ref={importGridRef}
              duplicateResolution={duplicateEmailResolution}
              validationErrors={validationErrors}
              focusTarget={focusTarget}
              onCellActivated={handleCellActivated}
              onCellEdited={handleCellEdited}
              fullscreenSlot={<FullscreenToggle />}
              {...gridRemoveProps}
            />
          </div>
          <aside className="flex w-72 shrink-0 flex-col gap-3">
            {sidePanelContent}
          </aside>
        </div>
      ) : null}

      <LinkNoticeBar notice={notice} onDismiss={dismissNotice} />

      <CoursePickerPopover
        target={pickerTarget}
        onClose={() => setPickerTarget(null)}
        onPick={handleCoursePick}
      />
      <UserMatchPopover
        target={userMatchTarget}
        gridRef={importGridRef}
        onClose={() => setUserMatchTarget(null)}
        onResolve={handleUserMatchResolve}
      />
    </div>
  );
}
