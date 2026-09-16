"use client";

import { TimePicker } from "@/components/date/time-picker";
import { Field, Input } from "@/components/primitives";

export type SessionCreditToolbarProps = {
  maxSessions: number;
  onMaxSessionsChange: (next: number) => void;
  timeFrom: string;
  timeTo: string;
  onTimesChange: (timeFrom: string, timeTo: string) => void;
  selectedCount: number;
  reserveSelectedCount?: number;
  reserveCap?: number;
  spanLabel: string | null;
  capNote: string | null;
};

export function SessionCreditToolbar({
  maxSessions,
  onMaxSessionsChange,
  timeFrom,
  timeTo,
  onTimesChange,
  selectedCount,
  reserveSelectedCount = 0,
  reserveCap = 0,
  spanLabel,
  capNote,
}: SessionCreditToolbarProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field.Root className="w-32">
          <Field.Label htmlFor="schedule-credit-max">Max sessions</Field.Label>
          <Input
            id="schedule-credit-max"
            type="number"
            min={0}
            max={365}
            value={maxSessions}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              onMaxSessionsChange(Math.trunc(next));
            }}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label className="text-xs" htmlFor="schedule-credit-from">
            From
          </Field.Label>
          <TimePicker
            id="schedule-credit-from"
            className="w-[150px]"
            value={timeFrom}
            onChange={(next) => onTimesChange(next, timeTo)}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label className="text-xs" htmlFor="schedule-credit-to">
            To
          </Field.Label>
          <TimePicker
            id="schedule-credit-to"
            className="w-[150px]"
            value={timeTo}
            onChange={(next) => onTimesChange(timeFrom, next)}
          />
        </Field.Root>
      </div>
      <p className="text-sm text-text-muted">
        {selectedCount} of {maxSessions} sessions
        {reserveCap > 0
          ? ` · ${reserveSelectedCount} of ${reserveCap} reserve`
          : ""}
        {spanLabel ? ` · ${spanLabel}` : ""}
      </p>
      {capNote ? <p className="text-sm text-text-muted">{capNote}</p> : null}
    </div>
  );
}
