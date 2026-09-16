"use client";

import { weekdayNames } from "@/components/calendar/types";
import { TimePicker } from "@/components/date/time-picker";
import { WeekdayAnimalIcon } from "@/components/icons/weekday-animal-icons";
import { Button } from "@/components/primitives";
import { Checkbox } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { Select } from "@/components/primitives";
import {
  areRecurringSlotsValid,
  createEmptyRecurringSlot,
  recurringSlotTimeError,
} from "@/helpers/intake-schedule";
import {
  isOvernightSession,
  requiresOvernightConfirmation,
  sessionDurationMinutes,
} from "@/helpers/session-time";
import { normalizeTimeToHhMm } from "@/helpers/simple-schedule";
import { getTimezoneOffset } from "@/helpers/timeslot";
import { useTenant } from "@/hooks/useTenant";
import type { RecurringSlot } from "@/types/intake";
import { Plus, Trash as Trash2 } from "iconoir-react";
import { useState } from "react";

export function RecurringSlotsEditor({
  slots,
  onChange,
  idPrefix = "slot",
  overnightConfirmedByIndex,
  onOvernightConfirmedByIndexChange,
}: {
  slots: RecurringSlot[];
  onChange: (slots: RecurringSlot[]) => void;
  idPrefix?: string;
  overnightConfirmedByIndex?: Record<number, boolean>;
  onOvernightConfirmedByIndexChange?: (next: Record<number, boolean>) => void;
}) {
  const { tenant } = useTenant();
  const timezoneOffset = getTimezoneOffset(tenant?.timezone);
  const [internalOvernightConfirmed, setInternalOvernightConfirmed] = useState<
    Record<number, boolean>
  >({});

  const overnightConfirmed =
    overnightConfirmedByIndex ?? internalOvernightConfirmed;

  function setOvernightConfirmed(next: Record<number, boolean>) {
    if (onOvernightConfirmedByIndexChange) {
      onOvernightConfirmedByIndexChange(next);
    } else {
      setInternalOvernightConfirmed(next);
    }
  }

  function clearOvernightConfirmed(index: number) {
    const next = { ...overnightConfirmed };
    delete next[index];
    setOvernightConfirmed(next);
  }

  function updateSlot(index: number, patch: Partial<RecurringSlot>) {
    if ("time_from" in patch || "time_to" in patch) {
      clearOvernightConfirmed(index);
    }
    onChange(slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(index: number) {
    onChange(slots.filter((_, i) => i !== index));
    setOvernightConfirmed({});
  }

  function addSlot() {
    onChange([
      ...slots,
      createEmptyRecurringSlot({
        default_session_start_time: tenant?.default_session_start_time,
        default_session_duration_minutes: tenant?.default_session_duration_minutes,
      }),
    ]);
  }

  const slotsValid = areRecurringSlotsValid(slots);

  const sessionsLabel =
    tenant?.timezone && timezoneOffset
      ? `Sessions (${tenant.timezone}, ${timezoneOffset})`
      : "Sessions";

  return (
    <div className="space-y-3">
      <Field.Root>
        <Field.Label>{sessionsLabel}</Field.Label>
      </Field.Root>
      {slots.length === 0 ? (
        <p className="text-sm text-text-muted">No recurring sessions configured.</p>
      ) : (
        <ul className="space-y-2">
          {slots.map((slot, index) => {
            const timeError = recurringSlotTimeError(slot);
            const overnight = isOvernightSession(slot.time_from, slot.time_to);
            const needsConfirm =
              overnight &&
              requiresOvernightConfirmation(slot.time_from, slot.time_to) &&
              !overnightConfirmed[index];
            const overnightDurationHours =
              Math.round(
                (sessionDurationMinutes(slot.time_from, slot.time_to) / 60) * 10,
              ) / 10;

            return (
              <li
                key={`${idPrefix}-${index}`}
                className="flex flex-wrap items-end gap-2 rounded-md border p-3"
              >
                <Field.Root>
                  <Field.Label className="text-xs">Weekday</Field.Label>
                  <Select
                    items={weekdayNames.map((day) => ({
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <WeekdayAnimalIcon day={day} className="size-4 shrink-0" />
                          {day}
                        </span>
                      ),
                      value: day,
                    }))}
                    value={slot.weekday}
                    onValueChange={(weekday) =>
                      updateSlot(index, { weekday: weekday as string })
                    }
                    className="w-[120px]"
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-xs" htmlFor={`${idPrefix}-${index}-from`}>
                    From
                  </Field.Label>
                  <TimePicker
                    id={`${idPrefix}-${index}-from`}
                    className="w-[150px]"
                    value={slot.time_from}
                    onChange={(next) =>
                      updateSlot(index, {
                        time_from: normalizeTimeToHhMm(next),
                      })
                    }
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label className="text-xs" htmlFor={`${idPrefix}-${index}-to`}>
                    To
                  </Field.Label>
                  <TimePicker
                    id={`${idPrefix}-${index}-to`}
                    className="w-[150px]"
                    value={slot.time_to}
                    onChange={(next) =>
                      updateSlot(index, {
                        time_to: normalizeTimeToHhMm(next),
                      })
                    }
                  />
                </Field.Root>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove session"
                  onClick={() => removeSlot(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
                {timeError ? (
                  <p className="w-full text-xs text-destructive">{timeError}</p>
                ) : null}
                {overnight && !timeError ? (
                  <p className="w-full text-xs text-text-muted">Ends next day</p>
                ) : null}
                {overnight &&
                requiresOvernightConfirmation(slot.time_from, slot.time_to) ? (
                  <div className="flex w-full items-start gap-2">
                    <Checkbox
                      id={`${idPrefix}-${index}-overnight-confirmed`}
                      checked={overnightConfirmed[index] === true}
                      onCheckedChange={(checked) => {
                        setOvernightConfirmed({
                          ...overnightConfirmed,
                          [index]: checked === true,
                        });
                      }}
                    />
                    <label
                      htmlFor={`${idPrefix}-${index}-overnight-confirmed`}
                      className="text-sm"
                    >
                      This session ends the next day (~{overnightDurationHours} hr).
                      I confirm this is correct.
                    </label>
                  </div>
                ) : null}
                {needsConfirm ? (
                  <p className="w-full text-xs text-destructive">
                    Confirm the overnight session before continuing.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={addSlot}>
        <Plus className="mr-1 size-4" />
        Add session
      </Button>
      {!slotsValid && slots.length > 0 ? (
        <p className="text-xs text-destructive">
          Fix invalid or duplicate session times before continuing.
        </p>
      ) : null}
    </div>
  );
}

export function recurringSlotsEditorValid(
  slots: RecurringSlot[],
  opts?: { overnightConfirmedByIndex?: Record<number, boolean> },
): boolean {
  if (slots.length === 0) return true;
  if (!areRecurringSlotsValid(slots)) return false;
  return slots.every((slot, index) => {
    if (!requiresOvernightConfirmation(slot.time_from, slot.time_to)) return true;
    return opts?.overnightConfirmedByIndex?.[index] === true;
  });
}
