"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FormSaveStatus } from "@/lib/autosave/autosave-core";

export const DEFAULT_CELL_AUTOSAVE_TICK_MS = 1200;

export type CellAutosaveStatus = FormSaveStatus;

export type UseCellAutosaveOptions<T> = {
  value: T;
  onSave: (next: T) => Promise<void>;
  /** How long `showSavedTick` stays true after a successful save. Default 1200. */
  tickMs?: number;
  onOptimisticUpdate?: (next: T) => void;
  onRollback?: (previous: T) => void;
  onError?: (error: Error) => void;
};

export type UseCellAutosaveReturn<T> = {
  displayValue: T;
  setLocalValue: (next: T) => void;
  commit: () => Promise<void>;
  status: CellAutosaveStatus;
  showSavedTick: boolean;
  error: Error | null;
  retry: () => Promise<void>;
};

export type CellAutosaveCommitArgs<T> = {
  previousValue: T;
  nextValue: T;
  onSave: (next: T) => Promise<void>;
  onOptimisticUpdate?: (next: T) => void;
  onRollback?: (previous: T) => void;
  onError?: (error: Error) => void;
  setDisplayValue: (next: T) => void;
  setStatus: (status: CellAutosaveStatus) => void;
  setError: (error: Error | null) => void;
  setShowSavedTick: (visible: boolean) => void;
  clearTickTimer: () => void;
  scheduleTickClear: (cb: () => void, ms: number) => void;
  tickMs: number;
};

export type ControlledCellSyncInput<T> = {
  value: T;
  baseline: T;
  status: CellAutosaveStatus;
  inflight: boolean;
};

/**
 * Whether a controlled `value` prop should overwrite local display/baseline.
 * Sync on prop changes only — never because status flipped to `"saved"` while
 * the parent still holds a lagging value.
 */
export function shouldSyncControlledCellValue<T>(
  input: ControlledCellSyncInput<T>,
): boolean {
  if (input.inflight) return false;
  if (input.status === "error" || input.status === "saving") return false;
  // After a successful commit, wait until the controlled prop catches up to the
  // committed baseline before accepting it (avoids wiping optimistic display).
  if (
    input.status === "saved" &&
    !Object.is(input.value, input.baseline)
  ) {
    return false;
  }
  return true;
}

/** Keep displayRef in lockstep so same-tick `setLocalValue` + `commit` works. */
export function assignLocalCellValue<T>(
  next: T,
  setDisplayValue: (next: T) => void,
  displayRef: { current: T },
): void {
  displayRef.current = next;
  setDisplayValue(next);
}

/**
 * Pure commit path shared by the hook and unit tests.
 * Optimistic local value → onSave → saved tick, or rollback + onError → idle.
 */
export async function executeCellAutosaveCommit<T>(
  args: CellAutosaveCommitArgs<T>,
): Promise<void> {
  const {
    previousValue,
    nextValue,
    onSave,
    onOptimisticUpdate,
    onRollback,
    onError,
    setDisplayValue,
    setStatus,
    setError,
    setShowSavedTick,
    clearTickTimer,
    scheduleTickClear,
    tickMs,
  } = args;

  setDisplayValue(nextValue);
  setStatus("saving");
  setError(null);
  setShowSavedTick(false);
  clearTickTimer();
  onOptimisticUpdate?.(nextValue);

  try {
    await onSave(nextValue);
    setStatus("saved");
    setShowSavedTick(true);
    scheduleTickClear(() => {
      setShowSavedTick(false);
      // Return to idle so later controlled updates are not blocked by "saved".
      setStatus("idle");
    }, tickMs);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    setDisplayValue(previousValue);
    onRollback?.(previousValue);
    onError?.(error);
    setStatus("idle");
    setError(null);
    setShowSavedTick(false);
  }
}

/**
 * Cell-level autosave: optimistic display, `onSave`, reserved-space tick (~1.2s),
 * rollback + onError on failure. Compose with `CellSaveFeedback` via status /
 * `showSavedTick`.
 */
export function useCellAutosave<T>(
  options: UseCellAutosaveOptions<T>,
): UseCellAutosaveReturn<T> {
  const {
    value,
    onSave,
    tickMs = DEFAULT_CELL_AUTOSAVE_TICK_MS,
    onOptimisticUpdate,
    onRollback,
    onError,
  } = options;

  const [displayValue, setDisplayValue] = useState(value);
  const [status, setStatus] = useState<CellAutosaveStatus>("idle");
  const [showSavedTick, setShowSavedTick] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const displayRef = useRef(displayValue);
  const statusRef = useRef(status);
  const onSaveRef = useRef(onSave);
  const onOptimisticUpdateRef = useRef(onOptimisticUpdate);
  const onRollbackRef = useRef(onRollback);
  const onErrorRef = useRef(onError);
  const tickMsRef = useRef(tickMs);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineRef = useRef(value);
  const pendingRetryRef = useRef<T | null>(null);
  const inflightRef = useRef(false);
  const mountedRef = useRef(true);

  displayRef.current = displayValue;
  statusRef.current = status;
  onSaveRef.current = onSave;
  onOptimisticUpdateRef.current = onOptimisticUpdate;
  onRollbackRef.current = onRollback;
  onErrorRef.current = onError;
  tickMsRef.current = tickMs;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    };
  }, []);

  // Sync from parent only when `value` changes — not on status transitions
  // (status → "saved" must not re-apply a lagging controlled prop).
  useEffect(() => {
    if (
      !shouldSyncControlledCellValue({
        value,
        baseline: baselineRef.current,
        status: statusRef.current,
        inflight: inflightRef.current,
      })
    ) {
      return;
    }
    assignLocalCellValue(value, setDisplayValue, displayRef);
    baselineRef.current = value;
  }, [value]);

  const clearTickTimer = useCallback(() => {
    if (tickTimerRef.current) {
      clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const scheduleTickClear = useCallback(
    (cb: () => void, ms: number) => {
      clearTickTimer();
      tickTimerRef.current = setTimeout(() => {
        tickTimerRef.current = null;
        if (mountedRef.current) cb();
      }, ms);
    },
    [clearTickTimer],
  );

  const setLocalValue = useCallback((next: T) => {
    assignLocalCellValue(next, setDisplayValue, displayRef);
  }, []);

  const runCommit = useCallback(
    async (previousValue: T, nextValue: T) => {
      if (inflightRef.current) return;
      if (Object.is(previousValue, nextValue)) return;

      inflightRef.current = true;
      pendingRetryRef.current = nextValue;

      try {
        await executeCellAutosaveCommit({
          previousValue,
          nextValue,
          onSave: onSaveRef.current,
          onOptimisticUpdate: onOptimisticUpdateRef.current,
          onRollback: onRollbackRef.current,
          onError: onErrorRef.current,
          setDisplayValue: (v) => {
            if (!mountedRef.current) return;
            assignLocalCellValue(v, setDisplayValue, displayRef);
          },
          setStatus: (s) => {
            if (mountedRef.current) {
              statusRef.current = s;
              setStatus(s);
            }
          },
          setError: (e) => {
            if (mountedRef.current) setError(e);
          },
          setShowSavedTick: (v) => {
            if (mountedRef.current) setShowSavedTick(v);
          },
          clearTickTimer,
          scheduleTickClear,
          tickMs: tickMsRef.current,
        });
        if (Object.is(displayRef.current, nextValue)) {
          baselineRef.current = nextValue;
          pendingRetryRef.current = null;
        } else {
          pendingRetryRef.current = null;
        }
      } finally {
        inflightRef.current = false;
      }
    },
    [clearTickTimer, scheduleTickClear],
  );

  const commit = useCallback(async () => {
    await runCommit(baselineRef.current, displayRef.current);
  }, [runCommit]);

  const retry = useCallback(async () => {
    const next = pendingRetryRef.current;
    if (next === null) return;
    await runCommit(baselineRef.current, next);
  }, [runCommit]);

  return {
    displayValue,
    setLocalValue,
    commit,
    status,
    showSavedTick,
    error,
    retry,
  };
}
