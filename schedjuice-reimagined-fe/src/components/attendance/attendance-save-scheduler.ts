import type { AttendanceSavePayload } from "./attendance-save-payload";

export type CoalescedSaveScheduler = {
  requestSave: () => Promise<void>;
  isInFlight: () => boolean;
  hasPendingFlush: () => boolean;
};

type CreateCoalescedSaveSchedulerArgs = {
  buildPayload: () => AttendanceSavePayload[];
  sendPayload: (payload: AttendanceSavePayload[]) => Promise<void>;
  onBeforeSend?: () => void;
};

export function createCoalescedSaveScheduler({
  buildPayload,
  sendPayload,
  onBeforeSend,
}: CreateCoalescedSaveSchedulerArgs): CoalescedSaveScheduler {
  let inFlight = false;
  let pendingFlush = false;

  const requestSave = async (): Promise<void> => {
    if (inFlight) {
      pendingFlush = true;
      return;
    }

    const payload = buildPayload();
    if (payload.length === 0) {
      pendingFlush = false;
      return;
    }

    onBeforeSend?.();
    inFlight = true;
    pendingFlush = false;

    try {
      await sendPayload(payload);
    } finally {
      inFlight = false;
      const shouldFlushAgain = pendingFlush;
      pendingFlush = false;
      if (shouldFlushAgain) {
        await requestSave();
      }
    }
  };

  return {
    requestSave,
    isInFlight: () => inFlight,
    hasPendingFlush: () => pendingFlush,
  };
}
