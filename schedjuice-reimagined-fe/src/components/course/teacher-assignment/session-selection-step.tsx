"use client";

import { useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { weekdayNames } from "@/components/calendar/types";
import { CourseScheduleSummary } from "@/components/course/course-schedule-summary";
import { WeekdayAnimalIcon } from "@/components/icons/weekday-animal-icons";
import { Button, Switch } from "@/components/primitives";
import {
  lastSelectedIsoDate,
  sessionIdsForWeekdays,
  type SessionOption,
} from "@/helpers/course/session-grouping";
import type { TimeDisplayFormatValue } from "@/helpers/time-format";
import {
  crossfade,
  crossfadeInstant,
  staggerItem,
} from "@/lib/sj/motion";
import type { courseType } from "@/types/course";

import { SessionDateGrid } from "./session-date-grid";
import type { CourseRoleOption, SessionMode } from "./types";

export type SessionAssignAction = {
  onAssign: () => void;
  canAssign: boolean;
  isPending: boolean;
  onBack: () => void;
};

export type SessionSelectionStepProps = {
  course: Pick<
    courseType,
    | "title"
    | "start_date"
    | "end_date"
    | "repeat_every"
    | "first_event_time_from"
    | "first_event_time_to"
  >;
  sessions: SessionOption[];
  courseWeekdays: number[];
  role: CourseRoleOption;
  mode: SessionMode;
  onModeChange: (mode: SessionMode) => void;
  weekdays: number[];
  onWeekdaysChange: (weekdays: number[]) => void;
  selectedIds: Set<number>;
  onSelectedIdsChange: (ids: Set<number>) => void;
  autoRemoveEnabled: boolean;
  onAutoRemoveEnabledChange: (enabled: boolean) => void;
  timeFormat: TimeDisplayFormatValue;
  assignAction?: SessionAssignAction;
};

function formatIsoDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SessionSelectionStep({
  course,
  sessions,
  courseWeekdays: _courseWeekdays,
  role,
  mode,
  onModeChange,
  weekdays,
  onWeekdaysChange,
  selectedIds,
  onSelectedIdsChange,
  autoRemoveEnabled,
  onAutoRemoveEnabledChange,
  timeFormat,
  assignAction,
}: SessionSelectionStepProps) {
  const reduced = useReducedMotion();
  const modeVariants = reduced ? crossfadeInstant : crossfade;
  const summaryVariants = reduced ? crossfadeInstant : staggerItem;
  const autoRemoveVariants = reduced ? crossfadeInstant : crossfade;

  const effectiveMode: SessionMode = role.isSubstitute ? "custom" : mode;
  const selectedCount = selectedIds.size;
  const lastIsoDate = useMemo(
    () => lastSelectedIsoDate(sessions, selectedIds),
    [sessions, selectedIds],
  );

  function toggleWeekday(weekdayIndex: number) {
    const next = weekdays.includes(weekdayIndex)
      ? weekdays.filter((d) => d !== weekdayIndex)
      : [...weekdays, weekdayIndex].sort((a, b) => a - b);
    onWeekdaysChange(next);
    onSelectedIdsChange(new Set(sessionIdsForWeekdays(sessions, next)));
  }

  function toggleSession(sessionId: number) {
    const next = new Set(selectedIds);
    if (next.has(sessionId)) next.delete(sessionId);
    else next.add(sessionId);
    onSelectedIdsChange(next);
  }

  function toggleMonth(monthKey: string, nextSelected: boolean) {
    const next = new Set(selectedIds);
    for (const session of sessions) {
      if (session.monthKey !== monthKey) continue;
      if (nextSelected) next.add(session.id);
      else next.delete(session.id);
    }
    onSelectedIdsChange(next);
  }

  const showAutoRemove =
    role.isSubstitute && effectiveMode === "custom" && selectedCount > 0;
  const autoRemoveLabel =
    lastIsoDate === null
      ? ""
      : `Remove automatically after ${selectedCount} ${
          selectedCount === 1 ? "session" : "sessions"
        } (${formatIsoDateLabel(lastIsoDate)})`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="font-serif text-lg text-text-primary">Sessions</h3>
        {role.isSubstitute ? (
          <p className="text-sm text-text-secondary">
            Substitute cover is assigned to specific session dates.
          </p>
        ) : (
          <motion.div variants={summaryVariants} initial="hidden" animate="show">
            <CourseScheduleSummary
              course={course}
              sessions={sessions}
              timeFormat={timeFormat}
            />
          </motion.div>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!role.isSubstitute && effectiveMode === "weekdays" ? (
          <motion.div
            key="weekdays"
            variants={modeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-3"
          >
            <div className="flex flex-wrap gap-2">
              {weekdayNames.map((label, index) => {
                const selected = weekdays.includes(index);
                return (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={selected ? "primary" : "secondary"}
                    aria-pressed={selected}
                    className="gap-1.5"
                    onClick={() => toggleWeekday(index)}
                  >
                    <WeekdayAnimalIcon day={label} className="size-4.5 shrink-0" />
                    {label}
                  </Button>
                );
              })}
            </div>
            <p className="text-sm text-text-secondary">
              {selectedCount} {selectedCount === 1 ? "session" : "sessions"} selected
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0 underline"
              onClick={() => onModeChange("custom")}
            >
              Pick specific dates instead
            </Button>
          </motion.div>
        ) : null}

        {effectiveMode === "custom" ? (
          <motion.div
            key="custom"
            variants={modeVariants}
            initial={role.isSubstitute ? false : "initial"}
            animate="animate"
            exit="exit"
            className="space-y-3"
          >
            {!role.isSubstitute ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0 underline"
                onClick={() => onModeChange("weekdays")}
              >
                Back to weekdays
              </Button>
            ) : null}
            <AnimatePresence initial={false}>
              {showAutoRemove ? (
                <motion.div
                  key="auto-remove"
                  variants={autoRemoveVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-text-secondary">
                    <Switch
                      checked={autoRemoveEnabled}
                      onCheckedChange={onAutoRemoveEnabledChange}
                      aria-label={autoRemoveLabel}
                    />
                    <span className="space-y-1">
                      <span className="block text-text-primary">{autoRemoveLabel}</span>
                      <span className="block text-xs text-text-muted">
                        They are unassigned from this course and removed from its Microsoft
                        Teams team the day after the last covered session.
                      </span>
                    </span>
                  </label>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {assignAction ? (
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={assignAction.onBack}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!assignAction.canAssign}
                  isLoading={assignAction.isPending}
                  onClick={assignAction.onAssign}
                >
                  Assign
                </Button>
              </div>
            ) : null}
            <p className="text-sm text-text-secondary">
              {selectedCount} of {sessions.length} sessions selected
            </p>
            <SessionDateGrid
              sessions={sessions}
              selectedIds={selectedIds}
              onToggleSession={toggleSession}
              onToggleMonth={toggleMonth}
              timeFormat={timeFormat}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
