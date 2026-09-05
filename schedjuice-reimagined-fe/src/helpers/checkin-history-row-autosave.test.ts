import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCheckinHistoryRowPayload,
  createRowAutosaveDebouncer,
  resolveRowTimes,
  shouldScheduleRowAutosave,
} from "./checkin-history-row-autosave";

describe("resolveRowTimes", () => {
  it("prefers pending values over server values", () => {
    expect(
      resolveRowTimes(
        { checkin_time: "09:00", checkout_time: "10:30" },
        { checkin: "08:00", checkout: "09:00" },
      ),
    ).toEqual({ checkin: "09:00", checkout: "10:30" });
  });

  it("falls back to server when pending field missing", () => {
    expect(
      resolveRowTimes(
        { checkin_time: "09:00" },
        { checkin: "08:00", checkout: "11:00" },
      ),
    ).toEqual({ checkin: "09:00", checkout: "11:00" });
  });
});

describe("shouldScheduleRowAutosave", () => {
  it("returns true when both times are non-empty", () => {
    expect(shouldScheduleRowAutosave({ checkin: "09:00", checkout: "10:00" })).toBe(
      true,
    );
  });

  it("returns false when either time is empty", () => {
    expect(shouldScheduleRowAutosave({ checkin: "09:00", checkout: "" })).toBe(
      false,
    );
    expect(shouldScheduleRowAutosave({ checkin: "", checkout: "10:00" })).toBe(
      false,
    );
  });
});

describe("buildCheckinHistoryRowPayload", () => {
  it("maps pending times and student_count to API payload", () => {
    const payload = buildCheckinHistoryRowPayload(
      {
        eventDate: "2026-07-31",
        checkin_time: "21:30",
        checkout_time: "23:00",
        student_count: "12",
      },
      "Asia/Yangon",
    );
    expect(payload.checkin_time).toMatch(/T/);
    expect(payload.checkout_time).toMatch(/T/);
    expect(payload.student_count).toBe(12);
  });

  it("omits undefined pending keys", () => {
    const payload = buildCheckinHistoryRowPayload(
      { eventDate: "2026-07-31", checkin_time: "09:00", checkout_time: "10:00" },
      "Asia/Yangon",
    );
    expect(payload).not.toHaveProperty("student_count");
  });
});

describe("createRowAutosaveDebouncer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires callback after debounceMs", () => {
    const cb = vi.fn();
    const d = createRowAutosaveDebouncer(400);
    d.schedule("row-1", cb);
    vi.advanceTimersByTime(399);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledOnce();
  });

  it("cancels pending save when picker reopens", () => {
    const cb = vi.fn();
    const d = createRowAutosaveDebouncer(400);
    d.schedule("row-1", cb);
    d.cancel("row-1");
    vi.advanceTimersByTime(500);
    expect(cb).not.toHaveBeenCalled();
  });

  it("rescheduling same row resets timer", () => {
    const cb = vi.fn();
    const d = createRowAutosaveDebouncer(400);
    d.schedule("row-1", cb);
    vi.advanceTimersByTime(300);
    d.schedule("row-1", cb);
    vi.advanceTimersByTime(399);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledOnce();
  });
});
