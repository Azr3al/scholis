export type AttendanceDirtyEditKind = "status" | "note";

export type AutosaveDebounceSchedule = {
  debounceMs: number;
  maxWaitMs: number | null;
};

export const STATUS_AUTOSAVE_DEBOUNCE: AutosaveDebounceSchedule = {
  debounceMs: 250,
  maxWaitMs: 400,
};

export const NOTE_AUTOSAVE_DEBOUNCE: AutosaveDebounceSchedule = {
  debounceMs: 750,
  maxWaitMs: 4000,
};

export function getAutosaveDebounceSchedule(
  editKind: AttendanceDirtyEditKind,
): AutosaveDebounceSchedule {
  return editKind === "status"
    ? STATUS_AUTOSAVE_DEBOUNCE
    : NOTE_AUTOSAVE_DEBOUNCE;
}

type MaxWaitDebouncer = {
  schedule: (callback: () => void, config: AutosaveDebounceSchedule) => void;
  cancel: () => void;
  isPending: () => boolean;
};

export function createMaxWaitDebouncer(
  setTimeoutFn: typeof setTimeout = setTimeout,
  clearTimeoutFn: typeof clearTimeout = clearTimeout,
  nowFn: () => number = Date.now,
): MaxWaitDebouncer {
  let trailingTimer: ReturnType<typeof setTimeoutFn> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeoutFn> | null = null;
  let burstStartedAt: number | null = null;
  let pendingCallback: (() => void) | null = null;

  const clearTimers = () => {
    if (trailingTimer != null) {
      clearTimeoutFn(trailingTimer);
      trailingTimer = null;
    }
    if (maxWaitTimer != null) {
      clearTimeoutFn(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  const flush = () => {
    clearTimers();
    burstStartedAt = null;
    const callback = pendingCallback;
    pendingCallback = null;
    callback?.();
  };

  const cancel = () => {
    clearTimers();
    burstStartedAt = null;
    pendingCallback = null;
  };

  const schedule = (callback: () => void, config: AutosaveDebounceSchedule) => {
    pendingCallback = callback;

    if (trailingTimer != null) {
      clearTimeoutFn(trailingTimer);
      trailingTimer = null;
    }

    if (burstStartedAt == null) {
      burstStartedAt = nowFn();
      if (config.maxWaitMs != null) {
        maxWaitTimer = setTimeoutFn(flush, config.maxWaitMs);
      }
    }

    trailingTimer = setTimeoutFn(flush, config.debounceMs);
  };

  const isPending = () =>
    trailingTimer != null || maxWaitTimer != null || pendingCallback != null;

  return { schedule, cancel, isPending };
}
