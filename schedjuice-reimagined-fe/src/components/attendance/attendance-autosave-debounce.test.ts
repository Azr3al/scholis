import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMaxWaitDebouncer,
  NOTE_AUTOSAVE_DEBOUNCE,
  STATUS_AUTOSAVE_DEBOUNCE,
} from "./attendance-autosave-debounce";

describe("createMaxWaitDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires after debounceMs when idle between calls", () => {
    const callback = vi.fn();
    const debouncer = createMaxWaitDebouncer();

    debouncer.schedule(callback, STATUS_AUTOSAVE_DEBOUNCE);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(249);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("resets trailing timer on repeated calls", () => {
    const callback = vi.fn();
    const debouncer = createMaxWaitDebouncer();

    debouncer.schedule(callback, NOTE_AUTOSAVE_DEBOUNCE);
    vi.advanceTimersByTime(200);
    debouncer.schedule(callback, NOTE_AUTOSAVE_DEBOUNCE);

    vi.advanceTimersByTime(549);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(201);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires at maxWaitMs during a continuous burst", () => {
    const callback = vi.fn();
    const debouncer = createMaxWaitDebouncer();

    debouncer.schedule(callback, STATUS_AUTOSAVE_DEBOUNCE);

    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(100);
      debouncer.schedule(callback, STATUS_AUTOSAVE_DEBOUNCE);
    }

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires at maxWaitMs during continuous note input", () => {
    const callback = vi.fn();
    const debouncer = createMaxWaitDebouncer();

    debouncer.schedule(callback, NOTE_AUTOSAVE_DEBOUNCE);

    for (let i = 0; i < 39; i += 1) {
      vi.advanceTimersByTime(100);
      debouncer.schedule(callback, NOTE_AUTOSAVE_DEBOUNCE);
    }

    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("cancel clears pending callbacks", () => {
    const callback = vi.fn();
    const debouncer = createMaxWaitDebouncer();

    debouncer.schedule(callback, STATUS_AUTOSAVE_DEBOUNCE);
    debouncer.cancel();

    vi.advanceTimersByTime(1000);
    expect(callback).not.toHaveBeenCalled();
    expect(debouncer.isPending()).toBe(false);
  });
});
