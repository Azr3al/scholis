import { convertTenantTimeToUtc } from "@/helpers/timeslot";

export type CheckinHistoryPendingEdit = {
  eventDate?: string;
  checkin_time?: string | null;
  checkout_time?: string | null;
  hourly_rate_at_calculation?: string;
  student_count?: string;
};

export type ResolvedRowTimes = {
  checkin: string;
  checkout: string;
};

export const ROW_AUTOSAVE_DEBOUNCE_MS = 400;

export function resolveRowTimes(
  pending: Partial<CheckinHistoryPendingEdit>,
  server: { checkin: string; checkout: string },
): ResolvedRowTimes {
  return {
    checkin:
      pending.checkin_time !== undefined ? (pending.checkin_time ?? "") : server.checkin,
    checkout:
      pending.checkout_time !== undefined
        ? (pending.checkout_time ?? "")
        : server.checkout,
  };
}

export function shouldScheduleRowAutosave(times: ResolvedRowTimes): boolean {
  return Boolean(times.checkin && times.checkout);
}

export function buildCheckinHistoryRowPayload(
  edit: Partial<CheckinHistoryPendingEdit>,
  tenantTimezone?: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const eventDate = edit.eventDate ?? null;

  if (edit.checkin_time !== undefined) {
    payload.checkin_time =
      eventDate && edit.checkin_time
        ? convertTenantTimeToUtc(eventDate, edit.checkin_time, tenantTimezone)
        : null;
  }
  if (edit.checkout_time !== undefined) {
    payload.checkout_time =
      eventDate && edit.checkout_time
        ? convertTenantTimeToUtc(eventDate, edit.checkout_time, tenantTimezone)
        : null;
  }
  if (edit.hourly_rate_at_calculation !== undefined) {
    payload.hourly_rate_at_calculation =
      edit.hourly_rate_at_calculation === ""
        ? null
        : Number(edit.hourly_rate_at_calculation);
  }
  if (edit.student_count !== undefined) {
    payload.student_count =
      edit.student_count === "" ? null : Number(edit.student_count);
  }

  return payload;
}

export function createRowAutosaveDebouncer(debounceMs = ROW_AUTOSAVE_DEBOUNCE_MS) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (rowId: string) => {
    const t = timers.get(rowId);
    if (t != null) {
      clearTimeout(t);
      timers.delete(rowId);
    }
  };

  const schedule = (rowId: string, callback: () => void) => {
    cancel(rowId);
    const t = setTimeout(() => {
      timers.delete(rowId);
      callback();
    }, debounceMs);
    timers.set(rowId, t);
  };

  const cancelAll = () => {
    timers.forEach((_, rowId) => cancel(rowId));
  };

  return { schedule, cancel, cancelAll };
}
