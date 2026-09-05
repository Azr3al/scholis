"use client";
import { useToast } from "@/components/primitives";

import { updateEntity } from "@/app/client-api/utils";
import {
  buildCheckinHistoryRowPayload,
  createRowAutosaveDebouncer,
  shouldScheduleRowAutosave,
  type CheckinHistoryPendingEdit,
  type ResolvedRowTimes,
} from "@/helpers/checkin-history-row-autosave";
import { queryClient } from "@/lib/query";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

const TICK_MS = 2000;

type Args = {
  pendingEdits: Record<string, Partial<CheckinHistoryPendingEdit>>;
  tenantTimezone?: string;
  enabled: boolean;
  onSaveSuccess: () => void;
};

export function useCheckinHistoryRowAutosave({
  pendingEdits,
  tenantTimezone,
  enabled,
  onSaveSuccess,
}: Args) {
  const toast = useToast();
  const pendingRef = useRef(pendingEdits);
  pendingRef.current = pendingEdits;

  const debouncerRef = useRef(createRowAutosaveDebouncer());
  const [showSavedTick, setShowSavedTick] = useState(false);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = useMutation({
    mutationKey: ["autosaveFinanceCheckinRow"],
    mutationFn: async ({
      rowId,
      edit,
    }: {
      rowId: string;
      edit: Partial<CheckinHistoryPendingEdit>;
    }) => {
      const payload = buildCheckinHistoryRowPayload(edit, tenantTimezone);
      if (Object.keys(payload).length === 0) return;
      await updateEntity("user-events", rowId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-events"] });
      setShowSavedTick(true);
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
      tickTimerRef.current = setTimeout(() => setShowSavedTick(false), TICK_MS);
      onSaveSuccess();
    },
    onError: () => {
      toast.add({
        title: "Error",
        description: "Failed to save changes",
        type: "error",
      });
    },
  });

  const flushRow = useCallback(
    (rowId: string) => {
      if (!enabled || saveMutation.isPending) return;
      const edit = pendingRef.current[rowId];
      if (!edit) return;
      saveMutation.mutate({ rowId, edit });
    },
    [enabled, saveMutation],
  );

  const onPickerOpenChange = useCallback(
    (
      rowId: string | number,
      serverTimes: ResolvedRowTimes,
      field: "checkin" | "checkout",
      currentValue: string,
      open: boolean,
    ) => {
      if (!enabled) return;
      const key = String(rowId);
      const debouncer = debouncerRef.current;

      if (open) {
        debouncer.cancel(key);
        return;
      }

      const timesAtClose: ResolvedRowTimes = {
        checkin: field === "checkin" ? currentValue : serverTimes.checkin,
        checkout: field === "checkout" ? currentValue : serverTimes.checkout,
      };
      if (!shouldScheduleRowAutosave(timesAtClose)) return;

      debouncer.schedule(key, () => flushRow(key));
    },
    [enabled, flushRow],
  );

  const cancelAll = useCallback(() => {
    debouncerRef.current.cancelAll();
  }, []);

  useEffect(() => {
    const debouncer = debouncerRef.current;
    return () => {
      debouncer.cancelAll();
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    };
  }, []);

  return {
    onPickerOpenChange,
    cancelAll,
    showSavedTick,
    isSaving: saveMutation.isPending,
  };
}
