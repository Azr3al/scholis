"use client";

import { weekdayNames } from "@/components/calendar/types";
import { TimePicker } from "@/components/date/time-picker";
import { OptionalMark, RequiredMark } from "@/components/form/required-mark";
import { WeekdayToggleRow } from "@/components/scheduling/weekday-toggle-row";
import { Button, Field } from "@/components/primitives";
import {
  addMinutesToHhMm,
  canCollapseSlotsToSimple,
  normalizeTimeToHhMm,
  slotsToSimpleValue,
  timeStringToMinutesDuration,
  weekdaysForCourseType,
  type SimpleScheduleValue,
} from "@/helpers/simple-schedule";
import type { RecurringSlot } from "@/types/intake";
import { useMemo } from "react";

function normalizeTimeValue(value: string): string {
  return normalizeTimeToHhMm(value);
}

function durationMinutesBetween(from: string, to: string): number {
  const start = timeStringToMinutesDuration(from);
  const end = timeStringToMinutesDuration(to);
  if (end > start) return end - start;
  return 90;
}

export type SimpleSchedulePickerProps = {
  value: SimpleScheduleValue;
  onChange: (next: SimpleScheduleValue) => void;
  useWdWeNomenclature: boolean;
  mode?: "simple" | "custom";
  onModeChange?: (mode: "simple" | "custom") => void;
  renderCustom?: () => React.ReactNode;
  customSlotsForCollapse?: RecurringSlot[];
  idPrefix?: string;
  sessionsLabel?: string;
  /** When false, only day controls are shown (parent owns time fields). */
  showTimeFields?: boolean;
  /** Append required/optional marks on Days / From / To. */
  fieldMarks?: "optional" | "required";
  /** When false, hide Custom schedule and always use weekday toggles. */
  allowCustomMode?: boolean;
};

export function SimpleSchedulePicker({
  value,
  onChange,
  useWdWeNomenclature,
  mode = "simple",
  onModeChange,
  renderCustom,
  customSlotsForCollapse,
  idPrefix = "simple-schedule",
  sessionsLabel = "Sessions",
  showTimeFields = true,
  fieldMarks,
  allowCustomMode = true,
}: SimpleSchedulePickerProps) {
  const canGoBackToSimple = useMemo(() => {
    if (!customSlotsForCollapse) return false;
    return canCollapseSlotsToSimple(customSlotsForCollapse, useWdWeNomenclature);
  }, [customSlotsForCollapse, useWdWeNomenclature]);

  function toggleWeekday(day: string) {
    const selected = value.weekdays.includes(day);
    const weekdays = selected
      ? value.weekdays.filter((d) => d !== day)
      : [...value.weekdays, day];
    onChange({
      ...value,
      weekdays,
      course_type: null,
    });
  }

  function selectWdWe(type: "WD" | "WE") {
    if (value.course_type === type) {
      onChange({
        ...value,
        weekdays: [],
        course_type: null,
      });
      return;
    }
    onChange({
      ...value,
      weekdays: weekdaysForCourseType(type),
      course_type: type,
    });
  }

  function updateStart(nextStart: string) {
    const time_from = normalizeTimeValue(nextStart);
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
      time_to: normalizeTimeValue(nextEnd),
    });
  }

  const fieldMark =
    fieldMarks === "required" ? (
      <RequiredMark />
    ) : fieldMarks === "optional" ? (
      <OptionalMark />
    ) : null;

  if (allowCustomMode && mode === "custom" && renderCustom) {
    return (
      <div className="space-y-3">
        {renderCustom()}
        {canGoBackToSimple ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const simple = slotsToSimpleValue(customSlotsForCollapse ?? []);
              if (simple) onChange(simple);
              onModeChange?.("simple");
            }}
          >
            Back to simple
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Field.Root>
        <Field.Label>{sessionsLabel}</Field.Label>
      </Field.Root>

      <div className="space-y-2">
        <p className="text-xs text-text-muted">
          Days
          {fieldMark}
        </p>
        {useWdWeNomenclature ? (
          <div className="flex flex-wrap gap-2">
            {(["WD", "WE"] as const).map((type) => {
              const selected = value.course_type === type;
              return (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={selected ? "primary" : "secondary"}
                  aria-pressed={selected}
                  onClick={() => selectWdWe(type)}
                >
                  {type}
                </Button>
              );
            })}
          </div>
        ) : (
          <WeekdayToggleRow
            days={weekdayNames}
            selected={value.weekdays}
            onToggle={toggleWeekday}
          />
        )}
      </div>

      {showTimeFields ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field.Root>
            <Field.Label className="text-xs" htmlFor={`${idPrefix}-from`}>
              From
              {fieldMark}
            </Field.Label>
            <TimePicker
              id={`${idPrefix}-from`}
              className="w-[150px]"
              value={value.time_from}
              onChange={(next) => updateStart(next)}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label className="text-xs" htmlFor={`${idPrefix}-to`}>
              To
              {fieldMark}
            </Field.Label>
            <TimePicker
              id={`${idPrefix}-to`}
              className="w-[150px]"
              value={value.time_to}
              onChange={(next) => updateEnd(next)}
            />
          </Field.Root>
        </div>
      ) : null}

      {allowCustomMode ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onModeChange?.("custom")}
        >
          Custom schedule →
        </Button>
      ) : null}
    </div>
  );
}
