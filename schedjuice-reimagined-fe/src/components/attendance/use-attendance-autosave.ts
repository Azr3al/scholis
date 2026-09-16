"use client";

import { updateEntities } from "@/app/client-api/utils";
import type { attendanceType } from "@/types/attendance";
import { useMutation } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  createMaxWaitDebouncer,
  getAutosaveDebounceSchedule,
  type AttendanceDirtyEditKind,
} from "./attendance-autosave-debounce";
import { filterIdsForRowSaveIndicator } from "./attendance-row-save-tracking";
import {
  buildAttendanceSavePayload,
  sendAttendanceSaveKeepalive,
  type AttendanceSavePayload,
} from "./attendance-save-payload";
import { createCoalescedSaveScheduler } from "./attendance-save-scheduler";

const RETRY_DELAYS_MS = [1000, 3000, 8000] as const;
const RECENTLY_CHANGED_MS = 2000;
const SAVING_INDICATOR_DELAY_MS = 300;

export type AttendanceAutosaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "offline"
  | "error";

export type RowSaveState = "idle" | "pending" | "saving" | "saved" | "error";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type UseAttendanceAutosaveArgs = {
  attendances: attendanceType[];
  /** Shared ref synced by the page on every local edit before re-render. */
  attendancesRef: MutableRefObject<attendanceType[]>;
  dirtyIds: number[];
  /** Shared ref synced by the page on every local edit before re-render. */
  dirtyIdsRef: MutableRefObject<number[]>;
  /** Bumped on every local edit so debounce retriggers even when dirtyIds is unchanged. */
  dirtyRevision: number;
  /** Most recent edit type — status uses shorter debounce with maxWait. */
  dirtyEditKind: AttendanceDirtyEditKind;
  /** Per-row edit kind for optimistic row indicators. */
  dirtyKindByRow: Record<number, AttendanceDirtyEditKind>;
  enabled: boolean;
  onDirtyClear: (ids: number[]) => void;
  onSaveSuccess?: (savedIds: number[]) => void;
};

type UseAttendanceAutosaveResult = {
  status: AttendanceAutosaveStatus;
  savingIndicatorVisible: boolean;
  lastSavedAt: number | null;
  rowStates: Record<number, RowSaveState>;
  recentlyChangedIds: number[];
  retryNow: () => void;
  waitForFlush: (timeoutMs: number) => Promise<void>;
  getPendingPayload: () => AttendanceSavePayload[];
  flushWithKeepalive: () => void;
  flushPendingSave: (mode?: "normal" | "keepalive") => boolean;
  hasPendingChanges: boolean;
};

export function useAttendanceAutosave({
  attendances,
  attendancesRef,
  dirtyIds,
  dirtyIdsRef,
  dirtyRevision,
  dirtyEditKind,
  dirtyKindByRow,
  enabled,
  onDirtyClear,
  onSaveSuccess,
}: UseAttendanceAutosaveArgs): UseAttendanceAutosaveResult {
  const [status, setStatus] = useState<AttendanceAutosaveStatus>("idle");
  const [savingIndicatorVisible, setSavingIndicatorVisible] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [rowStates, setRowStates] = useState<Record<number, RowSaveState>>({});
  const [recentlyChangedIds, setRecentlyChangedIds] = useState<number[]>([]);

  const statusRef = useRef<AttendanceAutosaveStatus>("idle");
  statusRef.current = status;

  const dirtyKindByRowRef = useRef(dirtyKindByRow);
  dirtyKindByRowRef.current = dirtyKindByRow;

  const saveDebounceRef = useRef(createMaxWaitDebouncer());
  const activeBurstKindRef = useRef<AttendanceDirtyEditKind | null>(null);
  const retryTimeoutsRef = useRef<number[]>([]);
  const retryIndexRef = useRef(0);
  const lastPayloadRef = useRef<AttendanceSavePayload[] | null>(null);
  const recentlyChangedTimersRef = useRef<Record<number, number>>({});
  const savingIndicatorTimerRef = useRef<number | null>(null);
  const requestSaveRef = useRef<() => Promise<void>>(async () => undefined);
  const flushPendingSaveRef = useRef<
    (mode?: "normal" | "keepalive") => boolean
  >(() => false);

  const buildPayloadRef = useRef<() => AttendanceSavePayload[]>(() => []);
  const sendPayloadRef = useRef<
    (payload: AttendanceSavePayload[]) => Promise<void>
  >(async () => undefined);
  const cancelDebounceTimerRef = useRef<() => void>(() => undefined);

  const schedulerRef = useRef<ReturnType<typeof createCoalescedSaveScheduler> | null>(
    null,
  );
  if (schedulerRef.current == null) {
    schedulerRef.current = createCoalescedSaveScheduler({
      buildPayload: () => buildPayloadRef.current(),
      sendPayload: (payload) => sendPayloadRef.current(payload),
      onBeforeSend: () => cancelDebounceTimerRef.current(),
    });
  }

  const clearSavingIndicatorTimer = useCallback(() => {
    if (savingIndicatorTimerRef.current != null) {
      window.clearTimeout(savingIndicatorTimerRef.current);
      savingIndicatorTimerRef.current = null;
    }
  }, []);

  const clearRetryTimeouts = useCallback(() => {
    for (const id of retryTimeoutsRef.current) window.clearTimeout(id);
    retryTimeoutsRef.current = [];
  }, []);

  const setRowStateForIds = useCallback((ids: number[], state: RowSaveState) => {
    if (ids.length === 0) return;
    setRowStates((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = state;
      return next;
    });
  }, []);

  const markRecentlyChanged = useCallback((ids: number[]) => {
    const trackedIds = filterIdsForRowSaveIndicator(
      ids,
      dirtyKindByRowRef.current,
    );
    if (trackedIds.length === 0) return;

    setRecentlyChangedIds((prev) =>
      Array.from(new Set([...prev, ...trackedIds])),
    );
    for (const id of trackedIds) {
      if (recentlyChangedTimersRef.current[id] != null) {
        window.clearTimeout(recentlyChangedTimersRef.current[id]);
      }
      recentlyChangedTimersRef.current[id] = window.setTimeout(() => {
        setRecentlyChangedIds((prev) => prev.filter((rowId) => rowId !== id));
        delete recentlyChangedTimersRef.current[id];
      }, RECENTLY_CHANGED_MS);
    }
  }, []);

  const buildPayload = useCallback((): AttendanceSavePayload[] => {
    return buildAttendanceSavePayload(
      attendancesRef.current,
      dirtyIdsRef.current,
    );
  }, [attendancesRef, dirtyIdsRef]);

  const hasUnsavedEdits = useCallback((): boolean => {
    return (
      dirtyIdsRef.current.length > 0 ||
      saveDebounceRef.current.isPending() ||
      schedulerRef.current?.isInFlight() === true ||
      schedulerRef.current?.hasPendingFlush() === true
    );
  }, []);

  const clearDirtyIdsSync = useCallback(
    (ids: number[]) => {
      const idSet = new Set(ids);
      dirtyIdsRef.current = dirtyIdsRef.current.filter((rowId) => !idSet.has(rowId));
      onDirtyClear(ids);
    },
    [dirtyIdsRef, onDirtyClear],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: AttendanceSavePayload[]) => {
      lastPayloadRef.current = payload;
      return updateEntities("attendances", payload);
    },
    retry: false,
  });

  const mutateAsyncRef = useRef(saveMutation.mutateAsync);
  mutateAsyncRef.current = saveMutation.mutateAsync;

  const scheduleRetriesRef = useRef<(payload: AttendanceSavePayload[]) => void>(
    () => undefined,
  );

  const beginSavingIndicator = useCallback(() => {
    clearSavingIndicatorTimer();
    setSavingIndicatorVisible(false);
    savingIndicatorTimerRef.current = window.setTimeout(() => {
      if (statusRef.current === "saving") {
        setSavingIndicatorVisible(true);
      }
    }, SAVING_INDICATOR_DELAY_MS);
  }, [clearSavingIndicatorTimer]);

  const endSavingIndicator = useCallback(() => {
    clearSavingIndicatorTimer();
    setSavingIndicatorVisible(false);
  }, [clearSavingIndicatorTimer]);

  const setSavingRowStates = useCallback(
    (ids: number[]) => {
      const trackedIds = filterIdsForRowSaveIndicator(
        ids,
        dirtyKindByRowRef.current,
      );
      setRowStateForIds(trackedIds, "saving");
    },
    [setRowStateForIds],
  );

  const setSavedRowStates = useCallback(
    (ids: number[]) => {
      const trackedIds = filterIdsForRowSaveIndicator(
        ids,
        dirtyKindByRowRef.current,
      );
      setRowStateForIds(trackedIds, "saved");

      window.setTimeout(() => {
        setRowStates((prev) => {
          const next = { ...prev };
          for (const id of trackedIds) {
            if (next[id] === "saved") next[id] = "idle";
          }
          return next;
        });
      }, RECENTLY_CHANGED_MS);
    },
    [setRowStateForIds],
  );

  const setPendingRowStates = useCallback(
    (ids: number[]) => {
      const trackedIds = filterIdsForRowSaveIndicator(
        ids,
        dirtyKindByRowRef.current,
      ).filter((id) => dirtyIdsRef.current.includes(id));
      if (trackedIds.length === 0) return;

      setRowStates((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const id of trackedIds) {
          if (next[id] !== "saving" && next[id] !== "error") {
            next[id] = "pending";
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [dirtyIdsRef],
  );

  const scheduleRetries = useCallback(
    (payload: AttendanceSavePayload[]) => {
      const idx = retryIndexRef.current;
      if (idx >= RETRY_DELAYS_MS.length) {
        setStatus("error");
        statusRef.current = "error";
        endSavingIndicator();
        setRowStateForIds(
          payload.map((row) => row.id),
          "error",
        );
        return;
      }

      const delay = RETRY_DELAYS_MS[idx];
      retryIndexRef.current = idx + 1;
      const timeoutId = window.setTimeout(() => {
        if (!navigator.onLine) return;
        void requestSaveRef.current();
      }, delay);
      retryTimeoutsRef.current.push(timeoutId);
    },
    [endSavingIndicator, setRowStateForIds],
  );

  scheduleRetriesRef.current = scheduleRetries;

  const cancelDebounceTimer = useCallback(() => {
    saveDebounceRef.current.cancel();
    activeBurstKindRef.current = null;
  }, []);

  cancelDebounceTimerRef.current = cancelDebounceTimer;
  buildPayloadRef.current = buildPayload;

  const sendPayload = useCallback(
    async (payload: AttendanceSavePayload[]) => {
      if (payload.length === 0) return;

      const ids = payload.map((row) => row.id);
      setStatus("saving");
      statusRef.current = "saving";
      beginSavingIndicator();
      setSavingRowStates(ids);

      try {
        await mutateAsyncRef.current(payload);
        const syncedAt = Date.now();
        setLastSavedAt(syncedAt);
        setStatus("saved");
        statusRef.current = "saved";
        endSavingIndicator();
        retryIndexRef.current = 0;
        clearRetryTimeouts();
        clearDirtyIdsSync(ids);
        onSaveSuccess?.(ids);
        setSavedRowStates(ids);
        markRecentlyChanged(ids);
      } catch {
        endSavingIndicator();
        if (!navigator.onLine) {
          setStatus("offline");
          statusRef.current = "offline";
          setPendingRowStates(ids);
          clearRetryTimeouts();
          retryIndexRef.current = 0;
          return;
        }
        scheduleRetriesRef.current(payload);
      }
    },
    [
      beginSavingIndicator,
      endSavingIndicator,
      clearRetryTimeouts,
      clearDirtyIdsSync,
      onSaveSuccess,
      setSavingRowStates,
      setSavedRowStates,
      markRecentlyChanged,
      setPendingRowStates,
    ],
  );

  sendPayloadRef.current = sendPayload;

  const requestSave = useCallback(async () => {
    await schedulerRef.current!.requestSave();
  }, []);

  requestSaveRef.current = requestSave;

  const runDebouncedSave = useCallback(() => {
    activeBurstKindRef.current = null;
    void requestSaveRef.current();
  }, []);

  const scheduleDebouncedSave = useCallback(
    (editKind: AttendanceDirtyEditKind) => {
      if (
        activeBurstKindRef.current != null &&
        activeBurstKindRef.current !== editKind
      ) {
        saveDebounceRef.current.cancel();
        activeBurstKindRef.current = null;
      }

      if (activeBurstKindRef.current === null) {
        activeBurstKindRef.current = editKind;
      }

      saveDebounceRef.current.schedule(
        runDebouncedSave,
        getAutosaveDebounceSchedule(editKind),
      );
    },
    [runDebouncedSave],
  );

  useEffect(() => {
    if (!enabled || dirtyRevision === 0) return;

    setRowStates((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of dirtyIds) {
        if (filterIdsForRowSaveIndicator([id], dirtyKindByRow).length === 0) {
          continue;
        }
        if (next[id] !== "saving" && next[id] !== "error") {
          next[id] = "pending";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dirtyRevision, dirtyKindByRow, dirtyIds, enabled]);

  useEffect(() => {
    if (dirtyIds.length === 0) {
      cancelDebounceTimer();
    }
  }, [dirtyIds.length, cancelDebounceTimer]);

  useEffect(() => {
    if (!enabled) {
      cancelDebounceTimer();
      return;
    }

    if (dirtyIdsRef.current.length === 0) return;

    if (!navigator.onLine) {
      setStatus("offline");
      statusRef.current = "offline";
      return;
    }

    scheduleDebouncedSave(dirtyEditKind);
  }, [dirtyRevision, dirtyEditKind, enabled, scheduleDebouncedSave, cancelDebounceTimer, dirtyIdsRef]);

  useEffect(() => {
    const onOffline = () => {
      cancelDebounceTimer();
      clearRetryTimeouts();
      retryIndexRef.current = 0;
      endSavingIndicator();
      setStatus((prev) => {
        const next = prev === "error" ? "error" : "offline";
        statusRef.current = next;
        return next;
      });
    };

    const onOnline = () => {
      const currentStatus = statusRef.current;
      if (
        (currentStatus === "offline" || currentStatus === "error") &&
        enabled &&
        dirtyIdsRef.current.length > 0
      ) {
        void requestSaveRef.current();
      }
    };

    if (typeof window === "undefined") return;
    if (!navigator.onLine && statusRef.current !== "error") {
      setStatus("offline");
      statusRef.current = "offline";
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, clearRetryTimeouts, cancelDebounceTimer, endSavingIndicator, dirtyIdsRef]);

  const flushPendingSave = useCallback(
    (mode: "normal" | "keepalive" = "normal") => {
      const payload = buildPayload();
      if (payload.length === 0) return false;

      cancelDebounceTimer();
      lastPayloadRef.current = payload;

      if (mode === "keepalive") {
        sendAttendanceSaveKeepalive(payload);
        return true;
      }

      if (navigator.onLine) {
        void requestSaveRef.current();
      } else {
        sendAttendanceSaveKeepalive(payload);
      }
      return true;
    },
    [buildPayload, cancelDebounceTimer],
  );

  flushPendingSaveRef.current = flushPendingSave;

  const waitForFlush = useCallback(
    async (timeoutMs: number) => {
      if (!enabled) return;
      if (statusRef.current === "offline" || statusRef.current === "error") {
        return;
      }

      if (!hasUnsavedEdits() && buildPayload().length === 0) return;

      cancelDebounceTimer();
      if (buildPayload().length > 0 && navigator.onLine) {
        await Promise.race([requestSaveRef.current(), sleep(timeoutMs)]);
        return;
      }

      flushPendingSaveRef.current("keepalive");
    },
    [enabled, buildPayload, cancelDebounceTimer, hasUnsavedEdits],
  );

  const getPendingPayload = useCallback((): AttendanceSavePayload[] => {
    return buildPayload();
  }, [buildPayload]);

  const flushWithKeepalive = useCallback(() => {
    flushPendingSave("keepalive");
  }, [flushPendingSave]);

  useEffect(() => {
    return () => {
      cancelDebounceTimer();
      clearRetryTimeouts();
      clearSavingIndicatorTimer();
      for (const id of Object.values(recentlyChangedTimersRef.current)) {
        window.clearTimeout(id);
      }
      if (enabled && dirtyIdsRef.current.length > 0) {
        flushPendingSaveRef.current("keepalive");
      }
    };
  }, [enabled, cancelDebounceTimer, clearRetryTimeouts, clearSavingIndicatorTimer, dirtyIdsRef]);

  const retryNow = useCallback(() => {
    clearRetryTimeouts();
    retryIndexRef.current = 0;
    if (buildPayload().length > 0 && navigator.onLine) {
      void requestSaveRef.current();
    }
  }, [buildPayload, clearRetryTimeouts]);

  const hasPendingChanges =
    dirtyIdsRef.current.length > 0 ||
    status === "saving" ||
    saveDebounceRef.current.isPending() ||
    schedulerRef.current?.isInFlight() === true ||
    schedulerRef.current?.hasPendingFlush() === true;

  return {
    status,
    savingIndicatorVisible,
    lastSavedAt,
    rowStates,
    recentlyChangedIds,
    retryNow,
    waitForFlush,
    getPendingPayload,
    flushWithKeepalive,
    flushPendingSave,
    hasPendingChanges,
  };
}
