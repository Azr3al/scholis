"use client";

import { updateEntity } from "@/app/client-api/utils";
import type { AttendanceAutosaveStatus } from "@/components/attendance/use-attendance-autosave";
import { normalizeCell } from "@/lib/imports/normalize-cell";
import type { FormConfigField } from "@/types/form-config";
import type { organizationType } from "@/types/organization";
import type { StudentDataSheetRow } from "@/types/data-sheets";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { cellErrorKey } from "@/lib/data-sheets/student-data-sheet-cell";
import { updateStudentRowLocally } from "@/lib/data-sheets/student-data-sheet-adapter";
import { formFieldToImportDef } from "@/lib/data-sheets/student-data-sheet-field-utils";
import { buildStudentFieldPatch } from "@/lib/data-sheets/student-data-sheet-payload";

const AUTOSAVE_DEBOUNCE_MS = 750;

export type PendingStudentCellSave = {
  userId: number;
  fieldId: string;
  value: string;
  rollbackRow: StudentDataSheetRow;
};

export type UseStudentDataSheetAutosaveArgs = {
  enabled: boolean;
  setRows: React.Dispatch<React.SetStateAction<StudentDataSheetRow[]>>;
  fieldByPath: Map<string, FormConfigField>;
  tenant: organizationType | null;
  queryKey: unknown[];
  onValidationError?: (message: string) => void;
};

export type UseStudentDataSheetAutosaveResult = {
  status: AttendanceAutosaveStatus;
  lastSavedAt: number | null;
  errorCells: Set<string>;
  queueCellSave: (
    displayRowIndex: number,
    fieldId: string,
    value: string,
    previousRow: StudentDataSheetRow,
  ) => void;
  retryNow: () => void;
};

export function useStudentDataSheetAutosave({
  enabled,
  setRows,
  fieldByPath,
  tenant,
  queryKey,
  onValidationError,
}: UseStudentDataSheetAutosaveArgs): UseStudentDataSheetAutosaveResult {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AttendanceAutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [errorCells, setErrorCells] = useState<Set<string>>(new Set());
  const [dirtyRevision, setDirtyRevision] = useState(0);

  const pendingRef = useRef<Map<string, PendingStudentCellSave>>(new Map());
  const debounceTimerRef = useRef<number | null>(null);
  const lastPayloadRef = useRef<PendingStudentCellSave[] | null>(null);
  const saveChainRef = useRef(Promise.resolve());
  const displayRowIndexRef = useRef<Map<string, number>>(new Map());

  const saveMutation = useMutation({
    mutationFn: async (entries: PendingStudentCellSave[]) => {
      for (const entry of entries) {
        const field = fieldByPath.get(entry.fieldId);
        const importDef = field
          ? formFieldToImportDef(field)
          : {
              field_key: entry.fieldId,
              field_label: entry.fieldId,
              field_type: "text",
              choices: null,
              source: "builtin" as const,
              special: null,
              required_for_role: false,
            };
        const norm = normalizeCell(entry.value, importDef);
        if (norm.status === "error") {
          throw new Error(norm.reason ?? "Invalid value");
        }
        const payload = buildStudentFieldPatch(
          entry.fieldId,
          norm.value,
          field,
          tenant,
        );
        await updateEntity("users", String(entry.userId), payload);
      }
    },
    retry: false,
  });

  const mutateAsyncRef = useRef(saveMutation.mutateAsync);
  mutateAsyncRef.current = saveMutation.mutateAsync;

  const markErrorCells = useCallback(
    (entries: PendingStudentCellSave[]) => {
      setErrorCells((prev) => {
        const next = new Set(prev);
        for (const e of entries) {
          const rowIndex = displayRowIndexRef.current.get(
            `${e.userId}:${e.fieldId}`,
          );
          if (rowIndex != null) {
            next.add(cellErrorKey(rowIndex, e.fieldId));
          }
        }
        return next;
      });
      window.setTimeout(() => {
        setErrorCells((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const rowIndex = displayRowIndexRef.current.get(
              `${e.userId}:${e.fieldId}`,
            );
            if (rowIndex != null) {
              next.delete(cellErrorKey(rowIndex, e.fieldId));
            }
          }
          return next;
        });
      }, 3000);
    },
    [],
  );

  const rollbackEntries = useCallback(
    (entries: PendingStudentCellSave[]) => {
      setRows((prev) => {
        const byId = new Map(entries.map((e) => [e.userId, e.rollbackRow]));
        return prev.map((r) => byId.get(r.id) ?? r);
      });
    },
    [setRows],
  );

  const sendPayload = useCallback(
    async (entries: PendingStudentCellSave[]) => {
      if (entries.length === 0) return;

      setStatus("saving");
      try {
        await mutateAsyncRef.current(entries);
        for (const e of entries) {
          pendingRef.current.delete(`${e.userId}:${e.fieldId}`);
        }
        setLastSavedAt(Date.now());
        setStatus("saved");
        void queryClient.invalidateQueries({ queryKey });
      } catch (err) {
        rollbackEntries(entries);
        markErrorCells(entries);
        onValidationError?.(
          err instanceof Error ? err.message : "Could not save change.",
        );
        if (!navigator.onLine) {
          setStatus("offline");
          return;
        }
        setStatus("error");
      }
    },
    [
      markErrorCells,
      onValidationError,
      queryClient,
      queryKey,
      rollbackEntries,
    ],
  );

  const enqueueSave = useCallback((entries: PendingStudentCellSave[]) => {
    lastPayloadRef.current = entries;
    const next = saveChainRef.current
      .catch(() => undefined)
      .then(() => sendPayload(entries));
    saveChainRef.current = next.catch(() => undefined);
    return next;
  }, [sendPayload]);

  const flushPending = useCallback(() => {
    const entries = Array.from(pendingRef.current.values());
    if (entries.length === 0) return;
    void enqueueSave(entries);
  }, [enqueueSave]);

  const scheduleFlush = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      flushPending();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [flushPending]);

  const queueCellSave = useCallback(
    (
      displayRowIndex: number,
      fieldId: string,
      value: string,
      previousRow: StudentDataSheetRow,
    ) => {
      if (!enabled) return;

      const field = fieldByPath.get(fieldId);
      const importDef = field
        ? formFieldToImportDef(field)
        : {
            field_key: fieldId,
            field_label: fieldId,
            field_type: "text",
            choices: null,
            source: "builtin" as const,
            special: null,
            required_for_role: false,
          };
      const norm = normalizeCell(value, importDef);
      if (norm.status === "error") {
        markErrorCells([
          {
            userId: previousRow.id,
            fieldId,
            value,
            rollbackRow: previousRow,
          },
        ]);
        displayRowIndexRef.current.set(
          `${previousRow.id}:${fieldId}`,
          displayRowIndex,
        );
        setErrorCells((prev) => {
          const next = new Set(prev);
          next.add(cellErrorKey(displayRowIndex, fieldId));
          return next;
        });
        onValidationError?.(norm.reason ?? "Invalid value");
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === previousRow.id
            ? updateStudentRowLocally([r], 0, fieldId, norm.value, field)[0]!
            : r,
        ),
      );

      displayRowIndexRef.current.set(
        `${previousRow.id}:${fieldId}`,
        displayRowIndex,
      );
      pendingRef.current.set(`${previousRow.id}:${fieldId}`, {
        userId: previousRow.id,
        fieldId,
        value: norm.value,
        rollbackRow: previousRow,
      });
      setDirtyRevision((n) => n + 1);
      scheduleFlush();
    },
    [
      enabled,
      fieldByPath,
      markErrorCells,
      onValidationError,
      scheduleFlush,
      setRows,
    ],
  );

  useEffect(() => {
    if (!enabled || dirtyRevision === 0) return;
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    scheduleFlush();
    return () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [dirtyRevision, enabled, scheduleFlush]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const retryNow = useCallback(() => {
    const entries =
      lastPayloadRef.current ?? Array.from(pendingRef.current.values());
    if (entries.length > 0 && navigator.onLine) {
      void enqueueSave(entries);
    }
  }, [enqueueSave]);

  return {
    status,
    lastSavedAt,
    errorCells,
    queueCellSave,
    retryNow,
  };
}
