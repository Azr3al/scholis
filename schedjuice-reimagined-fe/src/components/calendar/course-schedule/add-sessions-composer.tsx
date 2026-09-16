"use client";

import { DatePicker } from "@/components/date/date-picker";
import HelpDialog from "@/components/misc/help-dialog";
import {
  courseTypeFromSlots,
  SlotsSimpleScheduleField,
} from "@/components/scheduling/slots-simple-schedule-field";
import TimeSelect from "@/components/calendar/time-select";
import { Button, Checkbox, Radio, RadioGroup } from "@/components/primitives";
import { stringToTimeValue } from "@/helpers/date";
import {
  applyAddPlan,
  buildAddSessionsPlan,
  formatDateList,
  maxDate,
  startOfToday,
} from "@/helpers/course-schedule-draft";
import { validateRecurringSlotsForCreate } from "@/helpers/create-course-schedule";
import { findOverlappingEventsOnDate } from "@/helpers/calendar";
import { getTimezoneOffset } from "@/helpers/timeslot";
import { validateSessionTimeRange } from "@/helpers/session-time";
import {
  canCollapseSlotsToSimple,
  courseTypeForWeekdays,
  normalizeTimeToHhMm,
  orgUsesWdWeNomenclature,
  resolveSessionDefaults,
  simpleValueToSlots,
  slotsToSimpleValue,
  type CourseTypeWdWe,
} from "@/helpers/simple-schedule";
import { crossfadeInstant, crossfadeOpacity, revealBar } from "@/lib/sj/motion";
import type { courseType, eventType } from "@/types/course";
import type { OverlapMergeEntry } from "@/types/course-schedule";
import type { RecurringSlot } from "@/types/intake";
import { format } from "date-fns";
import { ArrowRight } from "iconoir-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useMemo,
  useState,
  useEffect,
  useTransition,
  useDeferredValue,
  useCallback,
  useRef,
} from "react";
import { useTenant } from "@/hooks/useTenant";

export type RepeatMode = "weekly" | "once";

export type AddSessionsComposerProps = {
  open: boolean;
  onClose: () => void;
  course: courseType;
  flatEvents: Partial<eventType>[];
  onApply: (events: eventType[], merges: OverlapMergeEntry[]) => void;
  /** When set, composer edits a single existing session. */
  editingSession?: eventType | null;
  setCourse?: (course: courseType) => void;
};

export function AddSessionsComposer({
  open,
  onClose,
  course,
  flatEvents,
  onApply,
  editingSession = null,
  setCourse,
}: AddSessionsComposerProps) {
  const { tenant } = useTenant();
  const orgTimezone = tenant?.timezone || "UTC";
  const timezoneOffset = getTimezoneOffset(tenant?.timezone);
  const sessionDefaults = resolveSessionDefaults(tenant);
  const defaultTimeFrom = sessionDefaults.time_from;
  const defaultTimeTo = sessionDefaults.time_to;
  const useWdWe = orgUsesWdWeNomenclature(tenant?.is_wd_we_course_types_enabled);
  const reducedMotion = useReducedMotion();
  const barVariants = reducedMotion ? crossfadeInstant : revealBar;
  const sectionRef = useRef<HTMLElement | null>(null);

  const isEdit = Boolean(editingSession);

  useEffect(() => {
    if (!open || !isEdit) return;
    const frame = requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, isEdit, reducedMotion]);

  const [repeatMode, setRepeatMode] = useState<RepeatMode>("weekly");
  const [weekdays, setWeekdays] = useState<string[]>(course.repeat_every || []);
  const [timeFrom, setTimeFrom] = useState<string | null>(
    editingSession?.time_from ?? sessionDefaults.time_from,
  );
  const [timeTo, setTimeTo] = useState<string | null>(
    editingSession?.time_to ?? sessionDefaults.time_to,
  );
  const [skipSabbath, setSkipSabbath] = useState(
    course.is_close_on_sabbath ?? false,
  );
  const [singleDate, setSingleDate] = useState<Date | undefined>(
    editingSession?.date ? new Date(editingSession.date as string | Date) : undefined,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingCourseType, setPendingCourseType] =
    useState<CourseTypeWdWe | null>(null);
  const [slots, setSlots] = useState<RecurringSlot[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"simple" | "custom">("simple");
  const [, startPlanTransition] = useTransition();

  const deferredWeekdays = useDeferredValue(weekdays);
  const deferredTimeFrom = useDeferredValue(timeFrom);
  const deferredTimeTo = useDeferredValue(timeTo);
  const deferredSkipSabbath = useDeferredValue(skipSabbath);
  const deferredSingleDate = useDeferredValue(singleDate);
  const deferredRepeatMode = useDeferredValue(repeatMode);
  const deferredSlots = useDeferredValue(slots);
  const deferredScheduleMode = useDeferredValue(scheduleMode);

  const buildInitialSlots = useCallback(
    (repeatEvery: string[], from: string, to: string): RecurringSlot[] =>
      simpleValueToSlots({
        weekdays: repeatEvery,
        time_from: from,
        time_to: to,
        course_type: courseTypeForWeekdays(repeatEvery),
      }),
    [],
  );

  useEffect(() => {
    if (!open) return;
    setValidationError(null);
    if (editingSession) {
      setTimeFrom(editingSession.time_from ?? defaultTimeFrom);
      setTimeTo(editingSession.time_to ?? defaultTimeTo);
      return;
    }
    setRepeatMode("weekly");
    setWeekdays(course.repeat_every || []);
    setTimeFrom(defaultTimeFrom);
    setTimeTo(defaultTimeTo);
    setSkipSabbath(course.is_close_on_sabbath ?? false);
    setSingleDate(undefined);
    setPendingCourseType(null);
    const initialSlots = buildInitialSlots(
      course.repeat_every || [],
      defaultTimeFrom,
      defaultTimeTo,
    );
    setSlots(initialSlots);
    setScheduleMode(
      canCollapseSlotsToSimple(initialSlots, useWdWe) ? "simple" : "custom",
    );
  }, [
    open,
    editingSession,
    course.repeat_every,
    course.is_close_on_sabbath,
    defaultTimeFrom,
    defaultTimeTo,
    buildInitialSlots,
    useWdWe,
  ]);

  const rangeStart = useMemo(
    () => maxDate(startOfToday(), new Date(course.start_date)),
    [course.start_date],
  );
  const rangeEnd = useMemo(() => new Date(course.end_date), [course.end_date]);

  const effectiveWeeklySlots = useMemo((): RecurringSlot[] => {
    if (deferredScheduleMode === "custom") return deferredSlots;
    const simple = slotsToSimpleValue(deferredSlots);
    const selectedWeekdays = simple?.weekdays ?? deferredWeekdays;
    if (!selectedWeekdays.length) return [];
    return simpleValueToSlots({
      weekdays: selectedWeekdays,
      time_from:
        normalizeTimeToHhMm(deferredTimeFrom) || sessionDefaults.time_from,
      time_to: normalizeTimeToHhMm(deferredTimeTo) || sessionDefaults.time_to,
      course_type:
        pendingCourseType ?? courseTypeForWeekdays(selectedWeekdays),
    });
  }, [
    deferredScheduleMode,
    deferredSlots,
    deferredWeekdays,
    deferredTimeFrom,
    deferredTimeTo,
    pendingCourseType,
    sessionDefaults,
  ]);

  const plan = useMemo(() => {
    if (!open || isEdit) return null;
    if (deferredRepeatMode === "weekly") {
      return buildAddSessionsPlan(flatEvents, {
        repeatMode: "weekly",
        weekdays: [],
        timeFrom: "",
        timeTo: "",
        slots: effectiveWeeklySlots,
        skipSabbath: deferredSkipSabbath,
        title: course.title,
        from: rangeStart,
        to: rangeEnd,
        orgTimezone,
      });
    }
    return buildAddSessionsPlan(flatEvents, {
      repeatMode: "once",
      weekdays: [],
      timeFrom: deferredTimeFrom ?? "",
      timeTo: deferredTimeTo ?? "",
      singleDate: deferredSingleDate,
      skipSabbath: deferredSkipSabbath,
      title: course.title,
      from: rangeStart,
      to: rangeEnd,
      orgTimezone,
    });
  }, [
    open,
    isEdit,
    effectiveWeeklySlots,
    deferredTimeFrom,
    deferredTimeTo,
    deferredRepeatMode,
    deferredSingleDate,
    deferredSkipSabbath,
    course.title,
    flatEvents,
    orgTimezone,
    rangeStart,
    rangeEnd,
  ]);

  const handleSlotsChange = useCallback(
    (next: RecurringSlot[]) => {
      startPlanTransition(() => {
        setSlots(next);
        const simple = slotsToSimpleValue(next);
        if (simple) {
          setWeekdays(simple.weekdays);
          setPendingCourseType(simple.course_type);
        } else {
          setWeekdays(
            Array.from(
              new Set(next.map((slot) => slot.weekday).filter(Boolean)),
            ),
          );
          setPendingCourseType(null);
        }
      });
    },
    [startPlanTransition],
  );

  const showSharedTimeFields =
    isEdit || repeatMode !== "weekly" || scheduleMode !== "custom";

  const editBlockedByCheckin = useMemo(() => {
    if (!isEdit || !editingSession || !timeFrom || !timeTo) return [];
    const isoDate = format(
      editingSession.date ? new Date(editingSession.date as string | Date) : new Date(),
      "yyyy-MM-dd",
    );
    return findOverlappingEventsOnDate(
      flatEvents,
      isoDate,
      timeFrom,
      timeTo,
      editingSession.id,
      { orgTimezone },
    ).filter((event) => event.has_checkin === true);
  }, [isEdit, editingSession, timeFrom, timeTo, flatEvents, orgTimezone]);

  const handleConfirm = () => {
    const weeklyCustom =
      !isEdit && repeatMode === "weekly" && scheduleMode === "custom";

    if (weeklyCustom) {
      const slotErr = validateRecurringSlotsForCreate(slots, {
        requireAtLeastOne: true,
      });
      if (slotErr) {
        setValidationError(slotErr);
        return;
      }
    } else {
      const rangeError = validateSessionTimeRange(timeFrom, timeTo);
      if (rangeError) {
        setValidationError(rangeError);
        return;
      }
    }

    if (isEdit && editingSession) {
      if (editBlockedByCheckin.length) {
        setValidationError(
          "Another session at this time has attendance. Choose a different time.",
        );
        return;
      }
      const isoDate = format(
        editingSession.date ? new Date(editingSession.date as string | Date) : new Date(),
        "yyyy-MM-dd",
      );
      const conflicts = findOverlappingEventsOnDate(
        flatEvents,
        isoDate,
        timeFrom!,
        timeTo!,
        editingSession.id,
        { orgTimezone },
      );
      if (conflicts.some((event) => event.has_checkin === true)) {
        setValidationError(
          "Another session at this time has attendance. Choose a different time.",
        );
        return;
      }
      const conflictIds = new Set(
        conflicts.map((event) => String(event.id)),
      );
      const next = flatEvents.map((event) => {
        if (event.id === editingSession.id) {
          return {
            ...event,
            time_from: timeFrom!,
            time_to: timeTo!,
            title: course.title,
            is_edit: true,
          };
        }
        if (conflictIds.has(String(event.id))) {
          return { ...event, is_deleted: true };
        }
        return event;
      });
      onApply(next as eventType[], []);
      onClose();
      return;
    }

    const confirmWeeklySlots =
      repeatMode === "weekly"
        ? scheduleMode === "custom"
          ? slots
          : simpleValueToSlots({
              weekdays,
              time_from:
                normalizeTimeToHhMm(timeFrom) || sessionDefaults.time_from,
              time_to: normalizeTimeToHhMm(timeTo) || sessionDefaults.time_to,
              course_type:
                pendingCourseType ?? courseTypeForWeekdays(weekdays),
            })
        : undefined;

    const confirmPlan = buildAddSessionsPlan(flatEvents, {
      repeatMode,
      weekdays: repeatMode === "weekly" ? [] : weekdays,
      timeFrom: timeFrom ?? "",
      timeTo: timeTo ?? "",
      slots: confirmWeeklySlots,
      singleDate,
      skipSabbath,
      title: course.title,
      from: rangeStart,
      to: rangeEnd,
      orgTimezone,
    });

    if (!confirmPlan?.additions.length) {
      setValidationError("Choose at least one day and a valid time range.");
      return;
    }

    if (repeatMode === "weekly" && setCourse) {
      const repeatEvery = confirmWeeklySlots
        ? Array.from(
            new Set(confirmWeeklySlots.map((slot) => slot.weekday)),
          )
        : weekdays;
      const nextCourseType =
        (confirmWeeklySlots ? courseTypeFromSlots(confirmWeeklySlots) : undefined) ??
        pendingCourseType ??
        courseTypeForWeekdays(repeatEvery);
      setCourse({
        ...course,
        is_recurring: true,
        repeat_every: repeatEvery,
        is_close_on_sabbath: skipSabbath,
        ...(nextCourseType ? { course_type: nextCourseType } : {}),
      });
    }

    const { events, merges } = applyAddPlan(flatEvents, confirmPlan);
    onApply(events as eventType[], merges);
    onClose();
  };

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.section
          ref={sectionRef}
          key="add-sessions-composer"
          variants={barVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="overflow-hidden rounded-lg border border-border-subtle bg-surface-elevated motion-reduce:transition-none"
        >
          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-serif text-xl text-text-primary">
                {isEdit ? "Edit session time" : "Add sessions"}
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
            </div>

            {!isEdit ? (
              <RadioGroup
                value={repeatMode}
                onValueChange={(value) => setRepeatMode(value as RepeatMode)}
                className="flex flex-row flex-wrap items-center gap-4"
              >
                <div className="flex items-center gap-2">
                  <Radio id="repeat-weekly" value="weekly" className="shrink-0" />
                  <label htmlFor="repeat-weekly" className="text-sm leading-none">
                    Weekly
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Radio id="repeat-once" value="once" className="shrink-0" />
                  <label htmlFor="repeat-once" className="text-sm leading-none">
                    Just once
                  </label>
                </div>
              </RadioGroup>
            ) : null}

            {!isEdit ? (
              <div className="min-h-28">
                <AnimatePresence mode="wait" initial={false}>
                  {repeatMode === "weekly" ? (
                    <motion.div
                      key="weekly"
                      variants={crossfadeOpacity}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      <SlotsSimpleScheduleField
                        slots={slots}
                        onChange={handleSlotsChange}
                        showTimeFields={false}
                        mode={scheduleMode}
                        onModeChange={setScheduleMode}
                        sessionsLabel="Days"
                        idPrefix="schedule-add"
                        fieldMarks="required"
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="once"
                      variants={crossfadeOpacity}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="flex flex-wrap items-center gap-x-3 gap-y-1"
                    >
                      <label className="shrink-0 text-sm font-medium">Date</label>
                      <DatePicker
                        date={singleDate}
                        setDate={setSingleDate}
                        fromDate={rangeStart}
                        toDate={rangeEnd}
                        size="default"
                        className="w-auto max-w-42 truncate"
                        popoverAlign="start"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : null}

            {showSharedTimeFields ? (
            <div className="flex flex-wrap items-end gap-2 sm:gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  From
                  {timezoneOffset && tenant?.timezone ? (
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      ({tenant.timezone}, {timezoneOffset})
                    </span>
                  ) : null}
                </label>
                <TimeSelect
                  value={timeFrom ? stringToTimeValue(timeFrom) : null}
                  onChange={(v) => setTimeFrom(v?.toString() ?? null)}
                />
              </div>
              <ArrowRight
                className="mb-2.5 size-4 shrink-0 text-text-muted/50"
                aria-hidden
              />
              <div className="space-y-1">
                <label className="text-sm font-medium">To</label>
                <TimeSelect
                  value={timeTo ? stringToTimeValue(timeTo) : null}
                  onChange={(v) => setTimeTo(v?.toString() ?? null)}
                />
              </div>
            </div>
            ) : null}

          {!isEdit ? (
            <>
              <p className="text-sm text-text-muted">
                Sessions run from {format(rangeStart, "MMM d, yyyy")} through{" "}
                {format(rangeEnd, "MMM d, yyyy")}.
              </p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="skip_sabbath"
                  checked={skipSabbath}
                  onCheckedChange={(checked) =>
                    setSkipSabbath(checked === true)
                  }
                />
                <label htmlFor="skip_sabbath" className="text-sm">
                  Skip Sabbath days
                </label>
                <HelpDialog
                  title="Skip Sabbath days"
                  content={
                    <p>
                      When checked, sessions are not created on Sabbath days
                      (traditional Burmese calendar).
                    </p>
                  }
                />
              </div>
            </>
          ) : null}

          <div className="min-h-12">
            <AnimatePresence mode="wait" initial={false}>
              {validationError ? (
                <motion.p
                  key="error"
                  variants={crossfadeOpacity}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="text-sm text-danger"
                  role="alert"
                >
                  {validationError}
                </motion.p>
              ) : plan?.replacedCount ? (
                <motion.p
                  key="replace"
                  variants={crossfadeOpacity}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="text-sm text-warning-foreground"
                >
                  {plan.replacedCount} existing session
                  {plan.replacedCount === 1 ? "" : "s"} overlap and will be
                  replaced: {formatDateList(plan.replacedDates)}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={
                Boolean(isEdit && editBlockedByCheckin.length) ||
                (!isEdit && !plan?.additions.length)
              }
            >
              {isEdit
                ? "Update session"
                : plan?.additions.length
                  ? `Add ${plan.additions.length} sessions`
                  : "Add sessions"}
            </Button>
          </div>
        </div>
      </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
