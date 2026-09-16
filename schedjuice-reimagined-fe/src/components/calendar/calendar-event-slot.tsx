"use client";

import { formateEventTime } from "@/helpers/date";
import { resolveTimeDisplayFormat } from "@/helpers/time-format";
import { formatSessionTimeRange } from "@/helpers/session-time";
import { useTenant } from "@/hooks/useTenant";

type Props = {
  title: string;
  timeFrom?: string;
  timeTo?: string;
  compact?: boolean;
  showBrandDot?: boolean;
};

export function CalendarEventSlot({
  title,
  timeFrom,
  timeTo,
  compact = false,
  showBrandDot = true,
}: Props) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  return (
    <>
      <p className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-text-primary">
        {showBrandDot ? (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-brand"
          />
        ) : null}
        <span className="min-w-0 truncate">{title}</span>
      </p>
      {!compact && timeFrom && timeTo ? (
        <p className="truncate pl-3 font-mono text-[11px] tabular-nums text-text-muted">
          {formatSessionTimeRange(timeFrom, timeTo, (t) =>
            formateEventTime(t, timeFormat)
          )}
        </p>
      ) : null}
    </>
  );
}
