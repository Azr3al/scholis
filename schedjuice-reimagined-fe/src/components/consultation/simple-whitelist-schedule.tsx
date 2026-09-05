"use client";

import InlineTimeSelect from "@/components/datatable/inline-time-select";
import { WeekdayToggleRow } from "@/components/scheduling/weekday-toggle-row";
import { Button, Field } from "@/components/primitives";
import {
  addMinutesToHhMm,
  normalizeTimeToHhMm,
  timeStringToMinutesDuration,
  type SimpleScheduleValue,
} from "@/helpers/simple-schedule";
import {
  consultationWeekdayToShort,
  shortWeekdayToConsultation,
} from "@/lib/consultation/whitelist-schedule";
import { cn } from "@/lib/utils";
import { CONSULTATION_WEEKDAY_KEYS } from "@/types/consultation";

function durationMinutesBetween(from: string, to: string): number {
  const start = timeStringToMinutesDuration(from);
  const end = timeStringToMinutesDuration(to);
  if (end > start) return end - start;
  return 90;
}

export function SimpleWhitelistSchedule({
  value,
  isBusy = false,
  readOnly = false,
  onChange,
  onCustomizeByDay,
}: {
  value: SimpleScheduleValue;
  isBusy?: boolean;
  readOnly?: boolean;
  onChange: (next: SimpleScheduleValue) => void;
  onCustomizeByDay: () => void;
}) {
  function toggleDay(day: (typeof CONSULTATION_WEEKDAY_KEYS)[number]) {
    const short = consultationWeekdayToShort(day);
    const selected = value.weekdays.includes(short);
    const weekdays = selected
      ? value.weekdays.filter((label) => label !== short)
      : [...value.weekdays, short];
    onChange({
      ...value,
      weekdays,
      course_type: null,
    });
  }

  function updateStart(nextStart: string) {
    const time_from = normalizeTimeToHhMm(nextStart);
    const duration = durationMinutesBetween(value.time_from, value.time_to);
    onChange({
      ...value,
      time_from,
      time_to: addMinutesToHhMm(time_from, duration),
    });
  }

  function updateEnd(nextEnd: string) {
    onChange({
      ...value,
      time_to: normalizeTimeToHhMm(nextEnd),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn(isBusy && "pointer-events-none opacity-60")}>
        <Field.Root>
          <Field.Label>Available days</Field.Label>
        </Field.Root>

        <div className="mt-2 space-y-2">
          <p className="text-xs text-text-muted">Days</p>
          <WeekdayToggleRow
            days={CONSULTATION_WEEKDAY_KEYS.map(consultationWeekdayToShort)}
            selected={value.weekdays}
            disabled={readOnly || isBusy}
            onToggle={(short) => {
              const key = shortWeekdayToConsultation(short);
              if (key) toggleDay(key);
            }}
          />
        </div>

        {!readOnly ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field.Root>
              <Field.Label className="text-xs">From</Field.Label>
              <InlineTimeSelect
                value={value.time_from}
                isDisabled={isBusy}
                aria-label="Available from"
                onChange={updateStart}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label className="text-xs">To</Field.Label>
              <InlineTimeSelect
                value={value.time_to}
                isDisabled={isBusy}
                aria-label="Available to"
                onChange={updateEnd}
              />
            </Field.Root>
          </div>
        ) : null}
      </div>

      {!readOnly ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit"
          disabled={isBusy}
          onClick={onCustomizeByDay}
        >
          Customize by day →
        </Button>
      ) : null}
    </div>
  );
}
