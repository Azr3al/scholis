import { describe, expect, it, vi } from "vitest";
import { createCoalescedSaveScheduler } from "./attendance-save-scheduler";
import type { AttendanceSavePayload } from "./attendance-save-payload";

function payload(ids: number[]): AttendanceSavePayload[] {
  return ids.map((id) => ({
    id,
    user: id * 10,
    event: 99,
    attendance_status: "present" as AttendanceSavePayload["attendance_status"],
    attendance_note: null,
  }));
}

describe("createCoalescedSaveScheduler", () => {
  it("does nothing when payload is empty", async () => {
    const sendPayload = vi.fn(async () => undefined);
    const scheduler = createCoalescedSaveScheduler({
      buildPayload: () => [],
      sendPayload,
    });

    await scheduler.requestSave();

    expect(sendPayload).not.toHaveBeenCalled();
  });

  it("sends a fresh payload once", async () => {
    const sendPayload = vi.fn(async () => undefined);
    const scheduler = createCoalescedSaveScheduler({
      buildPayload: () => payload([1, 2]),
      sendPayload,
    });

    await scheduler.requestSave();

    expect(sendPayload).toHaveBeenCalledTimes(1);
    expect(sendPayload).toHaveBeenCalledWith(payload([1, 2]));
  });

  it("coalesces concurrent requestSave calls into one in-flight send plus one follow-up", async () => {
    let dirtyIds = [1, 2];
    const sendPayload = vi.fn(async (saved: AttendanceSavePayload[]) => {
      dirtyIds = dirtyIds.filter(
        (id) => !saved.some((row) => row.id === id),
      );
    });

    const scheduler = createCoalescedSaveScheduler({
      buildPayload: () => payload(dirtyIds),
      sendPayload,
    });

    const first = scheduler.requestSave();
    expect(scheduler.isInFlight()).toBe(true);

    dirtyIds = [...dirtyIds, 3, 4];
    void scheduler.requestSave();
    expect(scheduler.hasPendingFlush()).toBe(true);

    await first;

    expect(sendPayload).toHaveBeenCalledTimes(2);
    expect(sendPayload.mock.calls[0][0]).toEqual(payload([1, 2]));
    expect(sendPayload.mock.calls[1][0]).toEqual(payload([3, 4]));
  });

  it("follow-up uses rebuilt payload, not the first snapshot", async () => {
    let dirtyIds = [1];
    const sendPayload = vi.fn(async (saved: AttendanceSavePayload[]) => {
      dirtyIds = dirtyIds.filter(
        (id) => !saved.some((row) => row.id === id),
      );
    });

    const scheduler = createCoalescedSaveScheduler({
      buildPayload: () => payload(dirtyIds),
      sendPayload,
    });

    const first = scheduler.requestSave();
    dirtyIds = [...dirtyIds, 2, 3];
    void scheduler.requestSave();

    await first;

    expect(sendPayload.mock.calls[1][0]).toEqual(payload([2, 3]));
  });

  it("calls onBeforeSend when starting a network save", async () => {
    const onBeforeSend = vi.fn();
    const scheduler = createCoalescedSaveScheduler({
      buildPayload: () => payload([1]),
      sendPayload: vi.fn(async () => undefined),
      onBeforeSend,
    });

    await scheduler.requestSave();

    expect(onBeforeSend).toHaveBeenCalledTimes(1);
  });
});
