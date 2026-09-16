"use client";

import { TimeField, type TimeValue } from "@/components/date/time-field";
import { Popover } from "@/components/primitives";
import { stringToTimeValue, timeValueToString } from "@/helpers/date";
import {
  hhmmTo12HourSegments,
  segmentsToHhmm,
  type Time12Period,
} from "@/helpers/time-12h";
import {
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { normalizeTimeToHhMm } from "@/helpers/simple-schedule";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { Clock } from "iconoir-react";

export type TimePickerProps = {
  id?: string;
  value: string;
  onChange: (hhmm: string) => void;
  disabled?: boolean;
  className?: string;
  /** Minute options / snap interval. Defaults to 5. */
  minuteStep?: number;
  timeDisplayFormat?: TimeDisplayFormatValue;
  "aria-label"?: string;
};

const pad2 = (n: number | string) => String(n).padStart(2, "0");

export function snapMinute(minute: number, step: number): number {
  const safeStep = Number.isFinite(step) && step > 0 ? Math.floor(step) : 5;
  const snapped = Math.round(minute / safeStep) * safeStep;
  return ((snapped % 60) + 60) % 60;
}

export function snapHhmm(hhmm: string, step: number): string {
  const normalized = normalizeTimeToHhMm(hhmm) || "00:00";
  const [h, m] = normalized.split(":").map((part) => parseInt(part, 10));
  return `${pad2(h ?? 0)}:${pad2(snapMinute(m ?? 0, step))}`;
}

function buildMinutes(step: number): string[] {
  const safeStep = Number.isFinite(step) && step > 0 ? Math.floor(step) : 5;
  const minutes: string[] = [];
  for (let m = 0; m < 60; m += safeStep) {
    minutes.push(pad2(m));
  }
  return minutes;
}

function Cell({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        "w-full rounded-md px-2 py-1.5 text-center text-sm tabular-nums transition-colors",
        selected
          ? "bg-[var(--action,var(--data-green-strong,#2f6e58))] text-[var(--action-foreground,#ffffff)]"
          : "text-text-primary hover:bg-surface-sunken",
      )}
      // pointerdown commits before popover dismiss/unmount can swallow click
      onPointerDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
    >
      {label}
    </button>
  );
}

export function TimePicker({
  id,
  value,
  onChange,
  disabled,
  className,
  minuteStep = 5,
  timeDisplayFormat,
  "aria-label": ariaLabel = "Time",
}: TimePickerProps) {
  const { tenant } = useTenant();
  const format = resolveTimeDisplayFormat(
    timeDisplayFormat ?? tenant?.time_display_format,
  );
  const hhmm = normalizeTimeToHhMm(value) || "00:00";
  const [hour24Part, minutePart] = hhmm.split(":");
  const hour24 = pad2(hour24Part ?? "00");
  const minute = pad2(minutePart ?? "00");
  const segments = hhmmTo12HourSegments(hhmm);
  const minutes = buildMinutes(minuteStep);
  const timeValue = useMemo(() => stringToTimeValue(hhmm), [hhmm]);
  const [open, setOpen] = useState(false);

  function emitSnapped(next: string) {
    const snapped = snapHhmm(next, minuteStep);
    if (snapped !== hhmm) onChange(snapped);
  }

  function emit24(nextHour24: string, nextMinute: string) {
    emitSnapped(`${pad2(nextHour24)}:${pad2(nextMinute)}`);
  }

  function emit12(
    nextHour12: string,
    nextMinute: string,
    nextPeriod: Time12Period,
  ) {
    emitSnapped(segmentsToHhmm(nextHour12, nextMinute, nextPeriod));
  }

  function handleFieldChange(next: TimeValue | null) {
    if (!next) return;
    const raw = timeValueToString(next);
    if (raw !== hhmm) onChange(raw);
  }

  function handleFieldBlur() {
    emitSnapped(hhmm);
  }

  return (
    <div
      className={cn(
        "inline-flex h-10 w-full items-center justify-between gap-1 rounded-md border border-border-strong bg-surface-sunken pr-1 text-base text-text-primary",
        "transition-colors duration-[var(--duration-fast)]",
        "focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-[var(--ring)]",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <TimeField
        id={id}
        aria-label={ariaLabel}
        value={timeValue}
        onChange={handleFieldChange}
        onBlur={handleFieldBlur}
        isDisabled={disabled}
        hourCycle={format === "12h" ? 12 : 24}
        granularity="minute"
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none outline-none focus-within:outline-none"
      />
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          type="button"
          disabled={disabled}
          aria-label="Open time picker"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          <Clock className="size-4" aria-hidden />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner align="end">
            <Popover.Popup className="p-2">
              <div className="flex gap-1">
                {format === "24h" ? (
                  <div
                    role="listbox"
                    aria-label="Hours"
                    className="max-h-48 w-14 overflow-y-auto"
                  >
                    {Array.from({ length: 24 }, (_, i) => pad2(i)).map((h) => (
                      <Cell
                        key={h}
                        label={h}
                        selected={h === hour24}
                        onSelect={() => emit24(h, minute)}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    role="listbox"
                    aria-label="Hours"
                    className="max-h-48 w-14 overflow-y-auto"
                  >
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                      (h) => (
                        <Cell
                          key={h}
                          label={h}
                          selected={h === (segments.hour ?? "")}
                          onSelect={() =>
                            emit12(
                              h,
                              minute,
                              (segments.period ?? "AM") as Time12Period,
                            )
                          }
                        />
                      ),
                    )}
                  </div>
                )}

                <div
                  role="listbox"
                  aria-label="Minutes"
                  className="max-h-48 w-14 overflow-y-auto"
                >
                  {minutes.map((m) => (
                    <Cell
                      key={m}
                      label={m}
                      selected={m === minute}
                      onSelect={() => {
                        if (format === "24h") {
                          emit24(hour24, m);
                        } else {
                          emit12(
                            segments.hour ?? "12",
                            m,
                            (segments.period ?? "AM") as Time12Period,
                          );
                        }
                      }}
                    />
                  ))}
                </div>

                {format === "12h" ? (
                  <div
                    role="listbox"
                    aria-label="Period"
                    className="max-h-48 w-14 overflow-y-auto"
                  >
                    {(["AM", "PM"] as const).map((period) => (
                      <Cell
                        key={period}
                        label={period}
                        selected={period === segments.period}
                        onSelect={() =>
                          emit12(segments.hour ?? "12", minute, period)
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
