"use client";

import { Button, Popover, buttonVariants, useToast } from "@/components/primitives";
import { Calendar as CalendarComponent } from "@/components/date/calendar";
import { CalendarTimezoneNotice } from "@/components/calendar/calendar-timezone-notice";
import {
  MonthGrid,
  type DayCellSession,
} from "@/components/calendar/grid/month-grid";
import { AddSessionsComposer } from "@/components/calendar/course-schedule/add-sessions-composer";
import { DeleteSessionsDialog } from "@/components/calendar/course-schedule/delete-sessions-dialog";
import { ScheduleSaveBar } from "@/components/calendar/course-schedule/schedule-save-bar";
import { SessionActionsDialog } from "@/components/calendar/course-schedule/session-actions-dialog";
import { SessionCreditToolbar } from "@/components/calendar/course-schedule/session-credit-toolbar";
import {
  confirmDiscardScheduleChanges,
  useUnsavedScheduleGuard,
} from "@/components/calendar/course-schedule/use-unsaved-schedule-guard";
import { makePostRequest } from "@/app/client-api/utils";
import { cleanDatesForBackend, getDateISOString } from "@/helpers/date";
import {
  hasOverlappingEventsInFlatList,
  isPersistedEventId,
  rawToFormattedEvents,
} from "@/helpers/calendar";
import { countDraftChanges as countScheduleDraftChanges } from "@/helpers/course-schedule-draft";
import { serializeEventsForEditEventsApi } from "@/helpers/course-schedule";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { sanitizeCoursePayloadForApiWrite } from "@/helpers/course-program-validation";
import {
  formatOverlapFixToast,
  resolveScheduleOverlaps,
} from "@/helpers/calendar-overlap-resolve";
import { formatDateRange, getDaysInMonth } from "@/helpers/date";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { cn } from "@/lib/utils";
import type { courseType, eventType } from "@/types/course";
import type { OverlapMergeEntry } from "@/types/course-schedule";
import { useMutation } from "@tanstack/react-query";
import { addMonths, format } from "date-fns";
import { NavArrowLeft, NavArrowRight } from "iconoir-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/hooks/useTenant";
import {
  activeReserveCount,
  activeTeachingCount,
  addCreditEvent,
  allowsMultipleSessionsPerDay,
  eventCalendarDate,
  isSessionCreditProgram,
  substitutionReserveCap,
} from "@/helpers/session-credit-draft";
import { isValidSessionTimeRange } from "@/helpers/session-time";
import { resolveSessionDefaults } from "@/helpers/simple-schedule";

export type CourseScheduleEditorProps = {
  course: courseType;
  setCourse?: (course: courseType) => void;
  events: eventType[];
  setEvents: (events: eventType[]) => void;
  /** Called after a successful edit-events write; may return refetched events for delete verification. */
  onSaveSuccess?: () => void | Promise<eventType[] | void>;
  onDirtyChange?: (dirty: boolean) => void;
  isLoading?: boolean;
};

export function CourseScheduleEditor({
  course,
  setCourse,
  events,
  setEvents,
  onSaveSuccess,
  onDirtyChange,
  isLoading = false,
}: CourseScheduleEditorProps) {
  const toast = useToast();
  const { tenant } = useTenant();
  const orgTimezone = tenant?.timezone || "UTC";
  const sessionDefaults = resolveSessionDefaults(tenant);
  const isCredit = isSessionCreditProgram(
    typeof course.program === "object" ? course.program : undefined,
  );
  const programObject =
    typeof course.program === "object" ? course.program : undefined;
  const reserveCap = substitutionReserveCap(programObject);
  const allowMultiplePerDay = allowsMultipleSessionsPerDay(programObject);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [days, setDays] = useState<Date[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<eventType | null>(null);
  const [activeSession, setActiveSession] = useState<eventType | null>(null);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingOverlapMerges, setPendingOverlapMerges] = useState<
    OverlapMergeEntry[]
  >([]);
  const [baselineEvents, setBaselineEvents] = useState<eventType[]>(events);
  const [isResolvingOverlaps, setIsResolvingOverlaps] = useState(false);
  const [creditMax, setCreditMax] = useState(course.max_sessions ?? 0);
  const [creditTimeFrom, setCreditTimeFrom] = useState(
    sessionDefaults.time_from,
  );
  const [creditTimeTo, setCreditTimeTo] = useState(sessionDefaults.time_to);
  const [creditCapNote, setCreditCapNote] = useState<string | null>(null);

  useEffect(() => {
    setDays(
      getDaysInMonth(currentDate.getMonth(), currentDate.getFullYear()),
    );
  }, [currentDate]);

  const formattedEvents = useMemo(
    () => rawToFormattedEvents(events, orgTimezone),
    [events, orgTimezone],
  );

  const flatEvents = useMemo(
    () => Object.values(formattedEvents).flat(),
    [formattedEvents],
  );

  useEffect(() => {
    if (countScheduleDraftChanges(flatEvents) !== 0) return;
    setBaselineEvents((prev) => (prev === events ? prev : events));
  }, [events, flatEvents]);

  const changeCount = useMemo(() => {
    const scheduleChanges = countScheduleDraftChanges(flatEvents);
    const maxDirty =
      isCredit && creditMax !== (course.max_sessions ?? 0) ? 1 : 0;
    return scheduleChanges + maxDirty;
  }, [flatEvents, isCredit, creditMax, course.max_sessions]);

  useUnsavedScheduleGuard(changeCount > 0);

  useEffect(() => {
    onDirtyChange?.(changeCount > 0);
  }, [changeCount, onDirtyChange]);

  const mergePendingOverlapMerges = useCallback((entries: OverlapMergeEntry[]) => {
    if (!entries.length) return;
    setPendingOverlapMerges((prev) => {
      const merged = [...prev];
      for (const entry of entries) {
        const existing = merged.find(
          (item) => item.survivor_draft_id === entry.survivor_draft_id,
        );
        if (existing) {
          existing.source_event_ids = Array.from(
            new Set([...existing.source_event_ids, ...entry.source_event_ids]),
          );
        } else {
          merged.push(entry);
        }
      }
      return merged;
    });
  }, []);

  const getSessionsForDay = useCallback(
    (date: Date): DayCellSession[] => {
      const key = getDateISOString(date);
      return (formattedEvents[key] || [])
        .filter((e) => !e.is_deleted)
        .map((e) => ({
          ...e,
          displayTitle: e.is_substitution_reserve
            ? "Substitution reserve"
            : course.title,
        }));
    },
    [formattedEvents, course.title],
  );

  const handleSessionClick = (session: eventType) => {
    setActiveSession(session);
    setSessionDialogOpen(true);
  };

  const applyCreditSpan = useCallback(
    (nextEvents: Partial<eventType>[]) => {
      if (!isCredit || !setCourse) return;
      const dates = nextEvents
        .filter((event) => !event.is_deleted)
        .map((event) => eventCalendarDate(event))
        .filter(Boolean)
        .sort();
      if (!dates.length) return;
      const start = dates[0];
      let end = dates[dates.length - 1];
      if (end <= start) {
        const [year, month, day] = start.split("-").map(Number);
        end = new Date(Date.UTC(year, month - 1, day + 1))
          .toISOString()
          .slice(0, 10);
      }
      setCourse({
        ...course,
        start_date: new Date(`${start}T12:00:00`),
        end_date: new Date(`${end}T12:00:00`),
      });
    },
    [course, isCredit, setCourse],
  );

  const creditTeachingCount = activeTeachingCount(flatEvents);
  const creditReserveCount = activeReserveCount(flatEvents);
  const creditSpanLabel = useMemo(() => {
    const dates = flatEvents
      .filter((event) => !event.is_deleted)
      .map((event) => eventCalendarDate(event))
      .filter(Boolean)
      .sort();
    if (!dates.length) return null;
    return formatDateRange(dates[0], dates[dates.length - 1]);
  }, [flatEvents]);

  const saveMutation = useMutation({
    mutationKey: ["course-schedule-save", course.id],
    mutationFn: async (args: {
      payload: Record<string, unknown>;
      deletedEventIds: string[];
    }) => {
      await makePostRequest(`courses/${course.id}/edit-events`, args.payload);
      return args.deletedEventIds;
    },
    onSuccess: async (deletedEventIds) => {
      const remaining = (flatEvents as eventType[]).filter(
        (event) => !event.is_deleted,
      );
      setPendingOverlapMerges([]);
      setEvents(remaining);
      setBaselineEvents(remaining);
      if (isCredit && setCourse) {
        setCourse({ ...course, max_sessions: creditMax });
      }
      onDirtyChange?.(false);

      let refetched: eventType[] | void;
      try {
        refetched = await onSaveSuccess?.();
      } catch {
        toast.add({
          type: "error",
          title: "Schedule saved, but refresh failed",
          description: "Reload the page to confirm your changes.",
        });
        return;
      }

      if (Array.isArray(refetched) && deletedEventIds.length > 0) {
        const stillPresent = deletedEventIds.filter((id) =>
          refetched.some((event) => String(event.id) === id),
        );
        if (stillPresent.length > 0) {
          toast.add({
            type: "error",
            title: "Could not delete session",
            description:
              "Save reported success, but the session is still on the schedule. Try again.",
          });
          return;
        }
      }

      toast.add({
        title: "Success",
        description: "Schedule updated successfully",
      });
    },
    onError: (error: unknown) => {
      toast.add({
        type: "error",
        title: "Could not save schedule",
        description: parseSchedjuiceApiError(error, "Try again."),
      });
    },
  });

  const handleSave = () => {
    const sanitized = sanitizeCoursePayloadForApiWrite(
      course as Record<string, unknown>,
    );
    const payload = {
      ...cleanDatesForBackend(sanitized, ["start_date", "end_date"]),
      ...(isCredit ? { max_sessions: creditMax } : {}),
    };
    const deletedEventIds = flatEvents
      .filter(
        (event) =>
          event.is_deleted &&
          isPersistedEventId(event.id as eventType["id"] | undefined),
      )
      .map((event) => String(event.id));
    saveMutation.mutate({
      deletedEventIds,
      payload: {
        course: payload,
        events: serializeEventsForEditEventsApi(flatEvents, course.id),
        ...(pendingOverlapMerges.length
          ? { overlap_merges: pendingOverlapMerges }
          : {}),
      },
    });
  };

  const handleDiscard = () => {
    if (!confirmDiscardScheduleChanges()) return;
    setEvents(baselineEvents);
    setPendingOverlapMerges([]);
    setCreditMax(course.max_sessions ?? 0);
    setCreditCapNote(null);
  };

  const handleApplyDraft = (next: eventType[], merges: OverlapMergeEntry[]) => {
    setEvents(next);
    mergePendingOverlapMerges(merges);
    applyCreditSpan(next);
  };

  const handleCreditEmptyDayClick = (date: Date) => {
    if (!isValidSessionTimeRange(creditTimeFrom, creditTimeTo)) {
      setCreditCapNote("Each session needs a valid start and end time.");
      return;
    }
    const result = addCreditEvent({
      events: flatEvents,
      isoDate: getDateISOString(date),
      timeFrom: creditTimeFrom,
      timeTo: creditTimeTo,
      maxSessions: creditMax,
      reserveCap,
      title: course.title,
      allowMultiplePerDay,
    });
    if (result.blockedReason === "at_teaching_cap") {
      setCreditCapNote("Raise Max sessions to add more.");
      return;
    }
    if (result.blockedReason === "at_reserve_cap") {
      setCreditCapNote("Raise substitution reserve days to add more reserve dates.");
      return;
    }
    if (result.blockedReason === "duplicate") return;
    setEvents(result.events as eventType[]);
    applyCreditSpan(result.events);
    setCreditCapNote(null);
  };

  const handleResolveLegacyOverlaps = async () => {
    setIsResolvingOverlaps(true);
    try {
      const result = await resolveScheduleOverlaps({
        courseId: course.id,
        flatEvents,
        mode: "auto_global",
        overlapOptions: { orgTimezone },
      });
      if (result.summary.removedCount === 0) {
        toast.add({ title: "No overlapping sessions." });
        return;
      }
      setEvents(result.events as eventType[]);
      mergePendingOverlapMerges(result.deferredMerges);
      toast.add({ title: formatOverlapFixToast(result.summary) });
    } catch (error) {
      toast.add({
        type: "error",
        title: "Could not clean up overlaps",
        description: parseSchedjuiceApiError(error, "Try again."),
      });
    } finally {
      setIsResolvingOverlaps(false);
    }
  };

  const hasLegacyOverlaps = useMemo(
    () => hasOverlappingEventsInFlatList(flatEvents, { orgTimezone }),
    [flatEvents, orgTimezone],
  );

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        {isCredit ? null : (
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            setEditingSession(null);
            setComposerOpen(true);
          }}
        >
          Add sessions
        </Button>
        )}
      </div>

      {isCredit ? (
        <SessionCreditToolbar
          maxSessions={creditMax}
          onMaxSessionsChange={(next) => {
            if (next < creditTeachingCount) {
              setCreditCapNote("Delete extra sessions before lowering max.");
              return;
            }
            setCreditMax(Math.max(0, next));
            setCreditCapNote(null);
          }}
          timeFrom={creditTimeFrom}
          timeTo={creditTimeTo}
          onTimesChange={(from, to) => {
            setCreditTimeFrom(from);
            setCreditTimeTo(to);
          }}
          selectedCount={creditTeachingCount}
          reserveSelectedCount={creditReserveCount}
          reserveCap={reserveCap}
          spanLabel={creditSpanLabel}
          capNote={creditCapNote}
        />
      ) : null}

      <CalendarTimezoneNotice />

      <AddSessionsComposer
        key={editingSession ? String(editingSession.id) : "add-new"}
        open={composerOpen}
        onClose={() => {
          setComposerOpen(false);
          setEditingSession(null);
        }}
        course={course}
        flatEvents={flatEvents}
        onApply={handleApplyDraft}
        editingSession={editingSession}
        setCourse={setCourse}
      />

      <MonthGrid
        days={days}
        currentDate={currentDate}
        getSessionsForDay={getSessionsForDay}
        isLoading={isLoading}
        orgTimezone={orgTimezone}
        onSessionClick={handleSessionClick}
        onEmptyDayClick={isCredit ? handleCreditEmptyDayClick : undefined}
        interactive
        showTitleInCells={false}
      />

      {hasLegacyOverlaps ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
          <p>This schedule has overlapping sessions from before.</p>
          <button
            type="button"
            className="mt-2 text-sm text-accent underline"
            disabled={isResolvingOverlaps}
            onClick={() => void handleResolveLegacyOverlaps()}
          >
            {isResolvingOverlaps ? "Cleaning up…" : "Clean up overlaps"}
          </button>
        </div>
      ) : null}

      <SessionActionsDialog
        session={activeSession}
        displayTitle={course.title}
        orgTimezone={orgTimezone}
        open={sessionDialogOpen}
        onOpenChange={setSessionDialogOpen}
        onEdit={() => {
          if (!activeSession) return;
          setSessionDialogOpen(false);
          setEditingSession(activeSession);
          setComposerOpen(true);
        }}
        onDelete={() => {
          setSessionDialogOpen(false);
          setDeleteDialogOpen(true);
        }}
      />

      <DeleteSessionsDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        anchor={activeSession}
        flatEvents={flatEvents}
        orgTimezone={orgTimezone}
        hideSeriesOptions={isCredit}
        onConfirm={(next) => {
          setEvents(next);
          applyCreditSpan(next);
        }}
      />

      <ScheduleSaveBar
        changeCount={changeCount}
        isSaving={saveMutation.isPending}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
