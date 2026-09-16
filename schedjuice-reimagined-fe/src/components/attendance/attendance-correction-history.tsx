"use client";

import type { AttendanceChangeEvent } from "@/app/client-api/attendance-self-correction";
import { Skeleton } from "@/components/primitives";
import { utcDateTimeToTenantHHmm } from "@/helpers/checkin-history";
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
  type TimeDisplayFormatValue,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import { staggerItem, staggerItemOpacity, staggerList } from "@/lib/sj/motion";
import { motion, useReducedMotion } from "motion/react";

function formatEventLabel(eventType: string) {
  if (eventType === "self_checkin_backfilled") {
    return "Backfilled";
  }
  if (eventType === "self_checkin_corrected") {
    return "Corrected";
  }
  return eventType;
}

function formatEventDescription(eventType: string) {
  if (eventType === "self_checkin_backfilled") {
    return "backfilled check-in";
  }
  if (eventType === "self_checkin_corrected") {
    return "corrected check-in";
  }
  return eventType;
}

function formatFieldLabel(field: string) {
  if (field === "checkin_time") return "Check-in";
  if (field === "checkout_time") return "Check-out";
  if (field === "checkin_image") return "Screenshot";
  if (field === "today_activities") return "Today's activities";
  return field;
}

function formatClockChangeValue(
  value: string | null,
  timeFormat: TimeDisplayFormatValue,
  tenantTimezone: string | undefined,
) {
  if (!value) return "—";
  const hhmm = value.includes("T")
    ? utcDateTimeToTenantHHmm(value, tenantTimezone)
    : value;
  return hhmm ? formatOrgTime(hhmm, timeFormat) : "—";
}

function formatChangeValue(
  field: string,
  value: string | null,
  timeFormat: TimeDisplayFormatValue,
  tenantTimezone: string | undefined,
) {
  if (field === "today_activities") {
    return formatActivitiesAuditValue(value);
  }
  if (field === "checkin_time" || field === "checkout_time") {
    return formatClockChangeValue(value, timeFormat, tenantTimezone);
  }
  return value ?? "—";
}

function formatImageAuditValue(value: string | null) {
  if (!value) return null;
  if (value === "present" || value === "updated") return null;
  return value;
}

function ScreenshotChangeDisplay({
  from,
  to,
}: {
  from: string | null;
  to: string | null;
}) {
  if (from === "present" && to === "updated") {
    return (
      <p className="text-sm text-text-secondary">Screenshot replaced</p>
    );
  }

  const before = formatImageAuditValue(from);
  const after = formatImageAuditValue(to);

  if (!before && !after) {
    return <span className="text-sm text-text-muted">—</span>;
  }

  if (!before && after) {
    return (
      <p className="text-sm text-text-secondary">
        Added{" "}
        <span className="font-mono text-text-primary">{after}</span>
      </p>
    );
  }

  if (before && after) {
    return (
      <div className="space-y-2">
        <div>
          <p className="text-xs text-text-muted">Before</p>
          <p className="font-mono text-sm text-text-muted">{before}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">After</p>
          <p className="font-mono text-sm text-text-secondary">{after}</p>
        </div>
      </div>
    );
  }

  return <span className="text-sm text-text-muted">—</span>;
}

function formatActivitiesAuditValue(value: string | null) {
  if (!value) return null;
  if (value === "present" || value === "updated") return null;
  return value;
}

function ActivitiesChangeDisplay({
  from,
  to,
}: {
  from: string | null;
  to: string | null;
}) {
  const before = formatActivitiesAuditValue(from);
  const after = formatActivitiesAuditValue(to);

  if (!before && !after) {
    return <span className="text-sm text-text-muted">—</span>;
  }

  if (!before && after) {
    return (
      <p className="whitespace-pre-wrap text-sm text-text-secondary">{after}</p>
    );
  }

  if (before && !after) {
    return (
      <div className="space-y-1">
        <p className="whitespace-pre-wrap text-sm text-text-muted line-through">
          {before}
        </p>
        <p className="text-xs text-text-muted">Cleared</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs text-text-muted">Before</p>
        <p className="whitespace-pre-wrap text-sm text-text-muted">{before}</p>
      </div>
      <div>
        <p className="text-xs text-text-muted">After</p>
        <p className="whitespace-pre-wrap text-sm text-text-secondary">
          {after}
        </p>
      </div>
    </div>
  );
}

function FieldChangeDisplay({
  field,
  from,
  to,
  timeFormat,
  tenantTimezone,
}: {
  field: string;
  from: string | null;
  to: string | null;
  timeFormat: TimeDisplayFormatValue;
  tenantTimezone: string | undefined;
}) {
  if (field === "today_activities") {
    return <ActivitiesChangeDisplay from={from} to={to} />;
  }

  if (field === "checkin_image") {
    return <ScreenshotChangeDisplay from={from} to={to} />;
  }

  return (
    <span className="text-sm text-text-secondary">
      {formatChangeValue(field, from, timeFormat, tenantTimezone)} →{" "}
      {formatChangeValue(field, to, timeFormat, tenantTimezone)}
    </span>
  );
}

function CorrectionHistoryCard({
  entry,
  timeFormat,
  tenantTimezone,
}: {
  entry: AttendanceChangeEvent;
  timeFormat: TimeDisplayFormatValue;
  tenantTimezone: string | undefined;
}) {
  const actorName = entry.actor?.name ?? "Teacher";
  const changes = entry.payload.changes ?? [];

  return (
    <article className="rounded-xl border border-border bg-surface-elevated p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {actorName}{" "}
            <span className="font-normal text-text-secondary">
              {formatEventDescription(entry.event_type)}
            </span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-text-muted">
            {new Date(entry.occurred_at).toLocaleString()}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          {formatEventLabel(entry.event_type)}
        </span>
      </div>

      {changes.length > 0 ? (
        <dl className="mt-3 space-y-2 border-t border-border-subtle pt-3">
          {changes.map((change) => (
            <div key={`${entry.id}-${change.field}`}>
              <dt className="text-xs text-text-muted">
                {formatFieldLabel(change.field)}
              </dt>
              <dd>
                <FieldChangeDisplay
                  field={change.field}
                  from={change.from}
                  to={change.to}
                  timeFormat={timeFormat}
                  tenantTimezone={tenantTimezone}
                />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {entry.payload.reason ? (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <p className="text-xs text-text-muted">
            <span className="font-medium text-text-secondary">Reason</span>{" "}
            {entry.payload.reason}
          </p>
        </div>
      ) : null}
    </article>
  );
}

export function AttendanceCorrectionHistorySkeleton() {
  return (
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading correction history"
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-xl border border-border bg-surface-elevated p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
          </div>
          <div className="space-y-2 border-t border-border-subtle pt-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AttendanceCorrectionHistoryCards({
  items,
}: {
  items: AttendanceChangeEvent[];
}) {
  const reducedMotion = useReducedMotion();
  const itemVariants = reducedMotion ? staggerItemOpacity : staggerItem;
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);

  if (!items.length) {
    return null;
  }

  return (
    <motion.div
      variants={staggerList}
      initial="hidden"
      animate="show"
      className="space-y-3"
    >
      {items.map((entry) => (
        <motion.div key={entry.id} variants={itemVariants}>
          <CorrectionHistoryCard
            entry={entry}
            timeFormat={timeFormat}
            tenantTimezone={tenant?.timezone}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
