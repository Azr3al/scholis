import { Button, buttonVariants, useToast } from "@/components/primitives";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getDaysInMonth, cleanDatesForBackend } from "@/helpers/date";
import { startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { CalendarMenu } from "./calendar-menu";
import { MonthView } from "./month-view";
import { CalendarView, RecurringMode } from "./types";
import { WeekView } from "./week-view";
import {
  FormattedEvents,
  hasAnyUndeletedEvents,
  hasOverlappingEventsInFlatList,
  SAVE_OVERLAP_ERROR,
} from "@/helpers/calendar";
import {
  formatOverlapFixToast,
  resolveScheduleOverlaps,
} from "@/helpers/calendar-overlap-resolve";
import {
  applySharedTimesToEvents,
  conflictIdsToReschedule,
  rescheduleClearsOverlaps,
} from "@/helpers/calendar-reschedule";
import { CalendarContext } from "./calendar-context";
import { RescheduleConflictsDialog } from "./reschedule-conflicts-dialog";
import { courseType, eventType } from "@/types/course";
import type { OverlapMergeEntry } from "@/types/course-schedule";
import CalendarLegends from "./calendar-legends";
import { CalendarTimezoneNotice } from "./calendar-timezone-notice";
import { useMutation } from "@tanstack/react-query";
import { makePostRequest } from "@/app/client-api/utils";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { CourseListView } from "./list-view/list-view";
import { cn } from "@/lib/utils";
import { sanitizeCoursePayloadForApiWrite } from "@/helpers/course-program-validation";
import { serializeEventsForEditEventsApi } from "@/helpers/course-schedule";
import { useTenant } from "@/hooks/useTenant";
import axios from "axios";

interface CalendarProps {
  events: FormattedEvents;
  setEvents?: (events: eventType[]) => void;

  areEventsSelectable?: boolean;
  onEventClick?: (event: eventType) => void;

  selectedEvents?: eventType[];
  setSelectedEvents?: (events: eventType[]) => void;

  showableViews?: CalendarView[];
  defaultView?: CalendarView;
  isEventAddOrEditMode?: boolean;
  showRecurringMode?: boolean;
  isInEventSelectionMode?: boolean;
  course?: courseType;
  setCourse?: (course: courseType) => void;
  onSaveSuccess?: () => void;
  isLoading?: boolean;
  renderEvent?: (event: eventType) => React.ReactNode;
  /** When true, show an error callout and optional retry. */
  loadError?: boolean;
  onRetry?: () => void;
  embedded?: boolean;
}

export const Calendar: React.FC<CalendarProps> = ({
  events,
  areEventsSelectable = false,
  onEventClick,
  selectedEvents,
  setSelectedEvents,
  showableViews = [CalendarView.MONTH, CalendarView.WEEK],
  defaultView = CalendarView.MONTH,
  isEventAddOrEditMode = false,
  setEvents,
  course,
  showRecurringMode = false,
  setCourse,
  onSaveSuccess,
  isInEventSelectionMode: isInEventSelectionModeProp = false,
  isLoading = false,
  renderEvent,
  loadError = false,
  onRetry,
  embedded = false,
}) => {
  const toast = useToast();
  const { tenant } = useTenant();
  const overlapOptions = useMemo(
    () => ({ orgTimezone: tenant?.timezone || "UTC" }),
    [tenant?.timezone]
  );
  const [isInEventSelectionMode, setIsInEventSelectionMode] = useState(
    isInEventSelectionModeProp
  );
  const [selectedEvent, setSelectedEvent] = useState<eventType | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [recurringMode, setRecurringMode] = useState<RecurringMode>(
    RecurringMode.CUSTOM
  );
  const [days, setDays] = useState<Date[]>([]);
  const [currentView, setCurrentView] = useState<CalendarView>(defaultView);
  const [pendingOverlapMerges, setPendingOverlapMerges] = useState<
    OverlapMergeEntry[]
  >([]);
  const [isResolvingOverlaps, setIsResolvingOverlaps] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isFixingOverlap, setIsFixingOverlap] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  const flatEvents = useMemo(
    () => Object.values(events).flat(),
    [events]
  );
  const hasOverlaps = hasOverlappingEventsInFlatList(
    flatEvents,
    overlapOptions
  );
  const rescheduleConflictIds = useMemo(
    () => conflictIdsToReschedule(flatEvents, overlapOptions),
    [flatEvents, overlapOptions]
  );

  const mergePendingOverlapMerges = useCallback(
    (entries: OverlapMergeEntry[]) => {
      if (!entries.length) return;
      setPendingOverlapMerges((prev) => {
        const merged = [...prev];
        for (const entry of entries) {
          const existing = merged.find(
            (item) => item.survivor_draft_id === entry.survivor_draft_id
          );
          if (existing) {
            existing.source_event_ids = Array.from(
              new Set([
                ...existing.source_event_ids,
                ...entry.source_event_ids,
              ])
            );
          } else {
            merged.push(entry);
          }
        }
        return merged;
      });
    },
    []
  );

  const handleReplaceOverlaps = useCallback(async () => {
    if (!course?.id || !setEvents) return;
    setIsResolvingOverlaps(true);
    try {
      const result = await resolveScheduleOverlaps({
        courseId: course.id,
        flatEvents,
        mode: "auto_global",
        overlapOptions,
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
        title: "Could not replace",
        description: parseSchedjuiceApiError(error, "Try again."),
      });
    } finally {
      setIsResolvingOverlaps(false);
    }
  }, [
    course?.id,
    flatEvents,
    mergePendingOverlapMerges,
    overlapOptions,
    setEvents,
    toast,
  ]);

  const handleRescheduleApply = useCallback(
    async (times: { time_from: string; time_to: string }) => {
      if (!setEvents || rescheduleConflictIds.length === 0) return;
      setIsFixingOverlap(true);
      setRescheduleError(null);
      try {
        const next = applySharedTimesToEvents(
          flatEvents,
          rescheduleConflictIds,
          times.time_from,
          times.time_to
        );
        if (!rescheduleClearsOverlaps(next, overlapOptions)) {
          setRescheduleError(
            "Those times still overlap. Choose different times or use Replace."
          );
          return;
        }
        setEvents(next as eventType[]);
        setIsRescheduleOpen(false);
      } finally {
        setIsFixingOverlap(false);
      }
    },
    [flatEvents, overlapOptions, rescheduleConflictIds, setEvents]
  );

  const eventUpdateMutation = useMutation({
    mutationKey: ["event-update"],
    mutationFn: (data: Record<string, unknown>) => {
      return makePostRequest(`courses/${course?.id}/edit-events`, data);
    },
    onSuccess: () => {
      setPendingOverlapMerges([]);
      onSaveSuccess?.();
    },
    onError: (error: unknown) => {
      const details =
        axios.isAxiosError(error) &&
        error.response?.data &&
        typeof error.response.data === "object"
          ? (error.response.data as { details?: { conflicts?: unknown[] } })
              .details
          : undefined;
      const hasConflictList =
        details &&
        typeof details === "object" &&
        Array.isArray((details as { conflicts?: unknown[] }).conflicts);
      toast.add({
        type: "error",
        title: "Could not save schedule",
        description: hasConflictList
          ? `${SAVE_OVERLAP_ERROR} Use Fix or Replace to resolve.`
          : parseSchedjuiceApiError(error, "Try again."),
      });
    },
  });

  useEffect(() => {
    if (currentView === CalendarView.MONTH) {
      setDays(
        getDaysInMonth(currentDate.getMonth(), currentDate.getFullYear())
      );
    } else {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      setDays(eachDayOfInterval({ start: weekStart, end: weekEnd }));
    }
  }, [currentDate, currentView]);

  const contextValue = {
    currentDate,
    setCurrentDate,
    currentView,
    setCurrentView,
    days,
    events,
    areEventsSelectable,
    onEventClick,
    selectedEvents,
    recurringMode,
    setRecurringMode,
    setSelectedEvents,
    showableViews,
    isEventAddOrEditMode,
    setEvents,
    selectedEvent,
    setSelectedEvent,
    course: course || null,
    showRecurringMode,
    isInEventSelectionMode,
    setIsInEventSelectionMode,
    setCourse,
    isLoading,
    renderEvent,
    pendingOverlapMerges,
    setPendingOverlapMerges,
    mergePendingOverlapMerges,
  };

  const hasEvents = hasAnyUndeletedEvents(events);
  const needsCalendarChromeWhileEmpty =
    isEventAddOrEditMode || areEventsSelectable || Boolean(setEvents);
  const showEmptySuccess =
    !isLoading &&
    !loadError &&
    !hasEvents &&
    !needsCalendarChromeWhileEmpty;

  const headerBlock = (
    <>
      <CalendarMenu />
      <CalendarLegends />
      <CalendarTimezoneNotice />
    </>
  );

  const bodyBlock = (
    <>
      {loadError ? (
        <div
          className="flex flex-col items-center gap-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-10 text-center"
          role="alert"
        >
          <p className="text-sm text-destructive">
            The schedule could not be loaded. Check your connection and try
            again.
          </p>
          {onRetry ? (
            <Button type="button" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : showEmptySuccess ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No sessions scheduled yet.
        </p>
      ) : (
        <>
          {currentView === CalendarView.MONTH && <MonthView />}
          {currentView === CalendarView.WEEK && <WeekView />}
          {currentView === CalendarView.LIST && <CourseListView />}
        </>
      )}
    </>
  );

  return (
    <CalendarContext.Provider value={contextValue}>
      {embedded ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">{headerBlock}</div>
          <div
            className={cn(
              "relative min-h-[min(70vh,52rem)]",
              isEventAddOrEditMode ? "pb-28 sm:pb-32" : "",
            )}
          >
            {bodyBlock}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0 rounded-2xl py-6">
          <div className="flex flex-col gap-4 space-y-0 px-6 pb-4 pt-0">
            {headerBlock}
          </div>
          <div
            className={cn(
              "relative min-h-[min(70vh,52rem)] px-6 pt-0",
              isEventAddOrEditMode ? "pb-28 sm:pb-32" : "pb-6",
            )}
          >
            {bodyBlock}
          </div>
        </div>
      )}
      {isEventAddOrEditMode && (
        <div
          className={cn(
            "sticky z-sticky mx-auto w-[min(100%-1.5rem,42rem)] max-w-[calc(100%-4rem)] sm:max-w-[calc(100%-1.5rem)]",
            "mb-[max(0.5rem,env(safe-area-inset-bottom,0px))] mt-2",
            "rounded-md border border-border bg-background/95 p-3 shadow-md backdrop-blur-md",
            "bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
          )}
        >
          <div className="flex flex-col gap-2">
            {hasOverlaps ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{SAVE_OVERLAP_ERROR}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="text-sm text-primary underline"
                    disabled={
                      isFixingOverlap || rescheduleConflictIds.length === 0
                    }
                    onClick={() => {
                      setRescheduleError(null);
                      setIsRescheduleOpen(true);
                    }}
                  >
                    Fix
                  </button>
                  <button
                    type="button"
                    className="text-sm text-primary underline"
                    disabled={isResolvingOverlaps}
                    onClick={() => void handleReplaceOverlaps()}
                  >
                    {isResolvingOverlaps ? "Replacing…" : "Replace"}
                  </button>
                </div>
              </div>
            ) : null}
            {pendingOverlapMerges.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Some attendance will merge when you save.
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <Button
              className="w-full shrink-0 sm:w-auto"
              onClick={() => {
                if (!course) return;
                if (hasOverlappingEventsInFlatList(flatEvents, overlapOptions)) {
                  toast.add({
                    type: "error",
                    title: "Could not save schedule",
                    description: SAVE_OVERLAP_ERROR,
                  });
                  return;
                }
                const sanitized = sanitizeCoursePayloadForApiWrite(
                  course as Record<string, unknown>,
                );
                const payload = cleanDatesForBackend(sanitized, [
                  "start_date",
                  "end_date",
                ]);
                eventUpdateMutation.mutate({
                  course: payload,
                  events: serializeEventsForEditEventsApi(flatEvents, course.id),
                  ...(pendingOverlapMerges.length
                    ? { overlap_merges: pendingOverlapMerges }
                    : {}),
                });
              }}
              isLoading={eventUpdateMutation.isLoading}
            >
              Save
            </Button>
            <p className="min-w-0 text-sm text-muted-foreground sm:max-w-[70%] sm:text-right">
              Click to save changes
            </p>
          </div>
          </div>
        </div>
      )}
      <RescheduleConflictsDialog
        open={isRescheduleOpen}
        onOpenChange={setIsRescheduleOpen}
        conflictCount={rescheduleConflictIds.length}
        primaryLabel="Apply"
        isSubmitting={isFixingOverlap}
        error={rescheduleError}
        onApply={handleRescheduleApply}
      />
    </CalendarContext.Provider>
  );
};
