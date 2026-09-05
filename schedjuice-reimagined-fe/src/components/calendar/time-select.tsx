"use client";
import { Select } from "@/components/primitives";

import { AriaTimeFieldProps, TimeValue } from "react-aria";

import { stringToTimeValue } from "@/helpers/date";
import {
  segmentsToTimeValueHhmm,
  timeValueTo12HourSegments,
  type Time12Period,
} from "@/helpers/time-12h";
import {
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";

interface TimeSelectProps extends AriaTimeFieldProps<TimeValue> {
  isPrecise?: boolean;
  timeDisplayFormat?: TimeDisplayFormatValue;
}

const pad2 = (n: number | string) => String(n).padStart(2, "0");

function TimeSelect({
  isPrecise = false,
  timeDisplayFormat,
  ...props
}: TimeSelectProps) {
  const { tenant } = useTenant();
  const format = resolveTimeDisplayFormat(
    timeDisplayFormat ?? tenant?.time_display_format,
  );
  const is24h = format === "24h";

  const { hour, minute, period } = timeValueTo12HourSegments(props.value ?? null);
  const hour24 = props.value != null ? pad2(props.value.hour) : null;
  const minute24 = props.value != null ? pad2(props.value.minute) : null;

  const handleChange12 = (name: string, value: string) => {
    const complete = {
      hour: hour ?? (name === "hour" ? value : "12"),
      minute: minute ?? (name === "minute" ? value : "00"),
      period: (period ?? (name === "period" ? value : "AM")) as Time12Period,
    };
    (complete as Record<string, string>)[name] = value;
    props.onChange?.(
      stringToTimeValue(
        segmentsToTimeValueHhmm(complete.hour, complete.minute, complete.period),
      ),
    );
  };

  const handleChange24 = (name: "hour" | "minute", value: string) => {
    const h = name === "hour" ? value : (hour24 ?? "00");
    const m = name === "minute" ? value : (minute24 ?? "00");
    props.onChange?.(stringToTimeValue(`${pad2(h)}:${pad2(m)}`));
  };

  const hours12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const hours24 = Array.from({ length: 24 }, (_, i) => pad2(i));
  const minutes = isPrecise
    ? Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"))
    : Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
  const periods = ["AM", "PM"];

  if (is24h) {
    return (
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1">
        <Select
          size="compact"
          value={hour24 ?? undefined}
          onValueChange={(value) =>
            handleChange24("hour", String(value ?? ""))
          }
          placeholder="hour"
          items={hours24.map((hr) => ({ value: hr, label: hr }))}
          className="min-w-0 w-full"
        />
        <span aria-hidden className="shrink-0 text-center text-text-muted">
          :
        </span>
        <Select
          size="compact"
          value={minute24 ?? undefined}
          onValueChange={(value) =>
            handleChange24("minute", String(value ?? ""))
          }
          placeholder="minute"
          items={minutes.map((m) => ({ value: m, label: m }))}
          className="min-w-0 w-full"
        />
      </div>
    );
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1">
      <Select
        size="compact"
        value={hour ?? undefined}
        onValueChange={(value) => handleChange12("hour", String(value ?? ""))}
        placeholder="hour"
        items={hours12.map((item) => ({ value: item, label: item }))}
        className="min-w-0 w-full"
      />
      <span aria-hidden className="shrink-0 text-center text-text-muted">
        :
      </span>
      <Select
        size="compact"
        value={minute ?? undefined}
        onValueChange={(value) => handleChange12("minute", String(value ?? ""))}
        placeholder="minute"
        items={minutes.map((item) => ({ value: item, label: item }))}
        className="min-w-0 w-full"
      />
      <Select
        size="compact"
        value={period ?? undefined}
        onValueChange={(value) => handleChange12("period", String(value ?? ""))}
        placeholder="AM/PM"
        items={periods.map((item) => ({ value: item, label: item }))}
        className="min-w-0 w-full"
      />
    </div>
  );
}

export default TimeSelect;
