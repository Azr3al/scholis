import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CELL_AUTOSAVE_TICK_MS,
  assignLocalCellValue,
  executeCellAutosaveCommit,
  shouldSyncControlledCellValue,
} from "../use-cell-autosave";

type Harness = {
  displayValue: string;
  status: "idle" | "saving" | "saved" | "error";
  showSavedTick: boolean;
  error: Error | null;
  tickClears: Array<() => void>;
};

function createHarness(initial: string): Harness & {
  setDisplayValue: (v: string) => void;
  setStatus: (s: Harness["status"]) => void;
  setError: (e: Error | null) => void;
  setShowSavedTick: (v: boolean) => void;
  clearTickTimer: () => void;
  scheduleTickClear: (cb: () => void, ms: number) => void;
} {
  const harness: Harness = {
    displayValue: initial,
    status: "idle",
    showSavedTick: false,
    error: null,
    tickClears: [],
  };

  return {
    get displayValue() {
      return harness.displayValue;
    },
    get status() {
      return harness.status;
    },
    get showSavedTick() {
      return harness.showSavedTick;
    },
    get error() {
      return harness.error;
    },
    get tickClears() {
      return harness.tickClears;
    },
    setDisplayValue: (v) => {
      harness.displayValue = v;
    },
    setStatus: (s) => {
      harness.status = s;
    },
    setError: (e) => {
      harness.error = e;
    },
    setShowSavedTick: (v) => {
      harness.showSavedTick = v;
    },
    clearTickTimer: () => {
      harness.tickClears = [];
    },
    scheduleTickClear: (cb) => {
      harness.tickClears.push(cb);
    },
  };
}

/** Thin session harness mirroring hook refs for sync + same-tick commit. */
function createSession(initial: string) {
  let propValue = initial;
  let displayValue = initial;
  let status: Harness["status"] = "idle";
  let showSavedTick = false;
  let error: Error | null = null;
  let inflight = false;
  const displayRef = { current: initial };
  const baselineRef = { current: initial };
  const tickClears: Array<() => void> = [];

  const setDisplayValue = (v: string) => {
    displayValue = v;
  };

  const applyControlledSync = () => {
    if (
      !shouldSyncControlledCellValue({
        value: propValue,
        baseline: baselineRef.current,
        status,
        inflight,
      })
    ) {
      return false;
    }
    assignLocalCellValue(propValue, setDisplayValue, displayRef);
    baselineRef.current = propValue;
    return true;
  };

  return {
    get displayValue() {
      return displayValue;
    },
    get status() {
      return status;
    },
    get showSavedTick() {
      return showSavedTick;
    },
    get error() {
      return error;
    },
    get baseline() {
      return baselineRef.current;
    },
    setLocalValue(next: string) {
      assignLocalCellValue(next, setDisplayValue, displayRef);
    },
    setPropValue(next: string) {
      propValue = next;
      return applyControlledSync();
    },
    /** Simulate status flipping to saved without the prop catching up yet. */
    noteStatus(next: Harness["status"]) {
      status = next;
      return applyControlledSync();
    },
    async commit(onSave: (next: string) => Promise<void>) {
      if (inflight) return;
      const previousValue = baselineRef.current;
      const nextValue = displayRef.current;
      if (Object.is(previousValue, nextValue)) return;

      inflight = true;
      try {
        await executeCellAutosaveCommit({
          previousValue,
          nextValue,
          onSave,
          setDisplayValue: (v) =>
            assignLocalCellValue(v, setDisplayValue, displayRef),
          setStatus: (s) => {
            status = s;
          },
          setError: (e) => {
            error = e;
          },
          setShowSavedTick: (v) => {
            showSavedTick = v;
          },
          clearTickTimer: () => {
            tickClears.length = 0;
          },
          scheduleTickClear: (cb) => {
            tickClears.push(cb);
          },
          tickMs: DEFAULT_CELL_AUTOSAVE_TICK_MS,
        });
        if (Object.is(displayRef.current, nextValue)) {
          baselineRef.current = nextValue;
        }
      } finally {
        inflight = false;
      }
    },
    flushTick() {
      const cbs = [...tickClears];
      tickClears.length = 0;
      for (const cb of cbs) cb();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("executeCellAutosaveCommit", () => {
  it("optimistically applies the next value, saves, then shows a saved tick", async () => {
    const h = createHarness("old");
    const onSave = vi.fn(async () => undefined);

    const done = executeCellAutosaveCommit({
      previousValue: "old",
      nextValue: "new",
      onSave,
      setDisplayValue: h.setDisplayValue,
      setStatus: h.setStatus,
      setError: h.setError,
      setShowSavedTick: h.setShowSavedTick,
      clearTickTimer: h.clearTickTimer,
      scheduleTickClear: h.scheduleTickClear,
      tickMs: DEFAULT_CELL_AUTOSAVE_TICK_MS,
    });

    expect(h.displayValue).toBe("new");
    expect(h.status).toBe("saving");
    expect(onSave).toHaveBeenCalledWith("new");

    await done;

    expect(h.status).toBe("saved");
    expect(h.showSavedTick).toBe(true);
    expect(h.error).toBeNull();
    expect(h.tickClears).toHaveLength(1);

    h.tickClears[0]!();
    expect(h.showSavedTick).toBe(false);
    expect(h.status).toBe("idle");
  });

  it("rolls back the display value and returns to idle when onSave fails", async () => {
    const h = createHarness("old");
    const failure = new Error("save failed");
    const onSave = vi.fn(async () => {
      throw failure;
    });

    await executeCellAutosaveCommit({
      previousValue: "old",
      nextValue: "new",
      onSave,
      setDisplayValue: h.setDisplayValue,
      setStatus: h.setStatus,
      setError: h.setError,
      setShowSavedTick: h.setShowSavedTick,
      clearTickTimer: h.clearTickTimer,
      scheduleTickClear: h.scheduleTickClear,
      tickMs: DEFAULT_CELL_AUTOSAVE_TICK_MS,
    });

    expect(h.displayValue).toBe("old");
    expect(h.status).toBe("idle");
    expect(h.error).toBeNull();
    expect(h.showSavedTick).toBe(false);
    expect(h.tickClears).toHaveLength(0);
  });

  it("calls onOptimisticUpdate before onSave, then skips onRollback on success", async () => {
    const h = createHarness("old");
    const onSave = vi.fn(async () => undefined);
    const onOptimisticUpdate = vi.fn();
    const onRollback = vi.fn();
    const onError = vi.fn();

    await executeCellAutosaveCommit({
      previousValue: "old",
      nextValue: "new",
      onSave,
      onOptimisticUpdate,
      onRollback,
      onError,
      setDisplayValue: h.setDisplayValue,
      setStatus: h.setStatus,
      setError: h.setError,
      setShowSavedTick: h.setShowSavedTick,
      clearTickTimer: h.clearTickTimer,
      scheduleTickClear: h.scheduleTickClear,
      tickMs: DEFAULT_CELL_AUTOSAVE_TICK_MS,
    });

    expect(onOptimisticUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      onSave.mock.invocationCallOrder[0]!,
    );
    expect(onOptimisticUpdate).toHaveBeenCalledWith("new");
    expect(onRollback).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(h.status).toBe("saved");
  });

  it("on failure rolls back, calls onRollback + onError, and returns to idle", async () => {
    const h = createHarness("old");
    const failure = new Error("save failed");
    const onSave = vi.fn(async () => {
      throw failure;
    });
    const onOptimisticUpdate = vi.fn();
    const onRollback = vi.fn();
    const onError = vi.fn();

    await executeCellAutosaveCommit({
      previousValue: "old",
      nextValue: "new",
      onSave,
      onOptimisticUpdate,
      onRollback,
      onError,
      setDisplayValue: h.setDisplayValue,
      setStatus: h.setStatus,
      setError: h.setError,
      setShowSavedTick: h.setShowSavedTick,
      clearTickTimer: h.clearTickTimer,
      scheduleTickClear: h.scheduleTickClear,
      tickMs: DEFAULT_CELL_AUTOSAVE_TICK_MS,
    });

    expect(h.displayValue).toBe("old");
    expect(h.status).toBe("idle");
    expect(h.error).toBeNull();
    expect(h.showSavedTick).toBe(false);
    expect(onOptimisticUpdate).toHaveBeenCalledWith("new");
    expect(onRollback).toHaveBeenCalledWith("old");
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("defaults tick duration to ~1200ms", () => {
    expect(DEFAULT_CELL_AUTOSAVE_TICK_MS).toBe(1200);
  });
});

describe("shouldSyncControlledCellValue", () => {
  it("skips sync while saved if controlled value still lags the baseline", () => {
    expect(
      shouldSyncControlledCellValue({
        value: "old",
        baseline: "new",
        status: "saved",
        inflight: false,
      }),
    ).toBe(false);
  });

  it("allows sync once controlled value catches up after save", () => {
    expect(
      shouldSyncControlledCellValue({
        value: "new",
        baseline: "new",
        status: "saved",
        inflight: false,
      }),
    ).toBe(true);
  });

  it("allows idle prop updates", () => {
    expect(
      shouldSyncControlledCellValue({
        value: "other",
        baseline: "old",
        status: "idle",
        inflight: false,
      }),
    ).toBe(true);
  });
});

describe("assignLocalCellValue + session commit", () => {
  it("commits the value from same-tick setLocalValue via displayRef", async () => {
    const session = createSession("old");
    const onSave = vi.fn(async () => undefined);

    session.setLocalValue("new");
    await session.commit(onSave);

    expect(onSave).toHaveBeenCalledWith("new");
    expect(session.displayValue).toBe("new");
    expect(session.status).toBe("saved");
    expect(session.baseline).toBe("new");
  });

  it("does not wipe optimistic display when status becomes saved before prop catches up", async () => {
    const session = createSession("old");
    const onSave = vi.fn(async () => undefined);

    session.setLocalValue("new");
    await session.commit(onSave);

    expect(session.displayValue).toBe("new");
    expect(session.status).toBe("saved");

    // Status-only re-sync (the old bug path) must not apply lagging prop.
    expect(session.noteStatus("saved")).toBe(false);
    expect(session.displayValue).toBe("new");

    // Prop still lagging — setPropValue with old must not wipe.
    expect(session.setPropValue("old")).toBe(false);
    expect(session.displayValue).toBe("new");

    // Prop catches up — sync allowed.
    expect(session.setPropValue("new")).toBe(true);
    expect(session.displayValue).toBe("new");
  });
});
