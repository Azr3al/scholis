"use client";

import {
  MonthGrid,
  type DayCellSession,
} from "@/components/calendar/grid/month-grid";
import { Calendar as CalendarComponent } from "@/components/date/calendar";
import { TimePicker } from "@/components/date/time-picker";
import {
  Button,
  Dialog,
  Field,
  Input,
  Popover,
  buttonVariants,
} from "@/components/primitives";
import {
  formatDateRange,
  getDateISOString,
  getDaysInMonth,
} from "@/helpers/date";
import {
  creditPicksOverlapNote,
  impliedSpan,
  overrideCreditPick,
  removeCreditPick,
  reservePicks,
  setCreditMaxSessions,
  setSharedCreditTimes,
  teachingPicks,
  toggleCreditDate,
  type SessionCreditDraft,
} from "@/helpers/session-credit-draft";
import { isValidSessionTimeRange } from "@/helpers/session-time";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { cn } from "@/lib/utils";
import type { eventType } from "@/types/course";
import { addMonths, format } from "date-fns";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/hooks/useTenant";

export type SessionCreditCreateCalendarProps = {
  draft: SessionCreditDraft;
  onChange: (next: SessionCreditDraft) => void;
  allowMultiplePerDay?: boolean;
};

export function SessionCreditCreateCalendar({
  draft,
  onChange,
  allowMultiplePerDay = false,
}: SessionCreditCreateCalendarProps) {
  const { tenant } = useTenant();
  const orgTimezone = tenant?.timezone || "UTC";
  const [currentDate, setCurrentDate] = useState(new Date());
  const [days, setDays] = useState<Date[]>([]);
  const [editingPickId, setEditingPickId] = useState<string | null>(null);
  const [editFrom, setEditFrom] = useState(draft.timeFrom);
  const [editTo, setEditTo] = useState(draft.timeTo);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setDays(getDaysInMonth(currentDate.getMonth(), currentDate.getFullYear()));
  }, [currentDate]);

  const span = impliedSpan(draft.picks);
  const spanLabel = span ? formatDateRange(span.start, span.end) : null;
  const editingPick = draft.picks.find((pick) => pick.clientId === editingPickId);
  const overlapNote = allowMultiplePerDay
    ? creditPicksOverlapNote(draft.picks)
    : null;

  const getSessionsForDay = useCallback(
    (date: Date): DayCellSession[] => {
      const iso = getDateISOString(date);
      return draft.picks
        .filter((item) => item.date === iso)
        .map((pick) => {
          const pickLabel = pick.isSubstitutionReserve
            ? "Substitution reserve"
            : "Session";
          return {
            id: pick.clientId,
            title: pickLabel,
            displayTitle: pickLabel,
            date: iso as unknown as Date,
            time_from: pick.time_from,
            time_to: pick.time_to,
            is_substitution_reserve: pick.isSubstitutionReserve ?? false,
          };
        });
    },
    [draft.picks],
  );

  const handleEmptyDayClick = useCallback(
    (date: Date) => {
      onChange(
        toggleCreditDate(draft, getDateISOString(date), {
          allowMultiplePerDay,
        }),
      );
    },
    [allowMultiplePerDay, draft, onChange],
  );

  const handleSessionClick = useCallback(
    (session: eventType) => {
      const pick = draft.picks.find((item) => item.clientId === String(session.id));
      if (!pick) return;
      setEditingPickId(pick.clientId);
      setEditFrom(pick.time_from);
      setEditTo(pick.time_to);
      setEditError(null);
    },
    [draft.picks],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field.Root className="w-32">
          <Field.Label htmlFor="session-credit-max">Max sessions</Field.Label>
          <Input
            id="session-credit-max"
            type="number"
            min={1}
            max={365}
            value={draft.maxSessions}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              onChange(setCreditMaxSessions(draft, Math.trunc(next)));
            }}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label className="text-xs" htmlFor="session-credit-from">
            From
          </Field.Label>
          <TimePicker
            id="session-credit-from"
            className="w-[150px]"
            value={draft.timeFrom}
            onChange={(next) => {
              if (!isValidSessionTimeRange(next, draft.timeTo)) {
                onChange({ ...draft, timeFrom: next });
                return;
              }
              onChange(setSharedCreditTimes(draft, next, draft.timeTo));
            }}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label className="text-xs" htmlFor="session-credit-to">
            To
          </Field.Label>
          <TimePicker
            id="session-credit-to"
            className="w-[150px]"
            value={draft.timeTo}
            onChange={(next) => {
              if (!isValidSessionTimeRange(draft.timeFrom, next)) {
                onChange({ ...draft, timeTo: next });
                return;
              }
              onChange(setSharedCreditTimes(draft, draft.timeFrom, next));
            }}
          />
        </Field.Root>
      </div>
      <p className="text-sm text-text-muted">
        {teachingPicks(draft.picks).length} of {draft.maxSessions} sessions
        {draft.reserveCap > 0
          ? ` · ${reservePicks(draft.picks).length} of ${draft.reserveCap} reserve`
          : ""}
        {spanLabel ? ` · ${spanLabel}` : ""}
      </p>
      {draft.capNote ? (
        <p className="text-sm text-text-muted">{draft.capNote}</p>
      ) : null}
      {overlapNote ? (
        <p className="text-sm text-destructive" role="alert">
          {overlapNote}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCurrentDate(addMonths(currentDate, -1))}
          aria-label="Previous month"
        >
          <NavArrowLeft />
        </Button>
        <Popover.Root modal>
          <Popover.Trigger
            type="button"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "min-w-40 justify-center tabular-nums font-serif text-lg",
            )}
          >
            {format(currentDate, "MMMM yyyy")}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className={dropdownPositionerClassName}>
              <Popover.Popup>
                <CalendarComponent
                  mode="single"
                  selected={currentDate}
                  onSelect={(date) => date && setCurrentDate(date)}
                />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          aria-label="Next month"
        >
          <NavArrowRight />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setCurrentDate(new Date())}
        >
          Today
        </Button>
      </div>

      <MonthGrid
        days={days}
        currentDate={currentDate}
        getSessionsForDay={getSessionsForDay}
        orgTimezone={orgTimezone}
        onEmptyDayClick={handleEmptyDayClick}
        onSessionClick={handleSessionClick}
        interactive
        showTitleInCells={false}
      />

      <Dialog.Root
        open={Boolean(editingPick)}
        onOpenChange={(open) => {
          if (!open) setEditingPickId(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup className="sm:max-w-sm">
            <Dialog.Title>Edit session time</Dialog.Title>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field.Root>
                <Field.Label className="text-xs">From</Field.Label>
                <TimePicker
                  className="w-[150px]"
                  value={editFrom}
                  onChange={setEditFrom}
                />
              </Field.Root>
              <Field.Root>
                <Field.Label className="text-xs">To</Field.Label>
                <TimePicker
                  className="w-[150px]"
                  value={editTo}
                  onChange={setEditTo}
                />
              </Field.Root>
            </div>
            {editError ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {editError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!editingPickId) return;
                  onChange(removeCreditPick(draft, editingPickId));
                  setEditingPickId(null);
                }}
              >
                Remove
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!editingPickId) return;
                  if (!isValidSessionTimeRange(editFrom, editTo)) {
                    setEditError("Each session needs a valid start and end time.");
                    return;
                  }
                  onChange(
                    overrideCreditPick(draft, editingPickId, editFrom, editTo),
                  );
                  setEditingPickId(null);
                }}
              >
                Save time
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
