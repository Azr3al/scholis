"use client";

import InlineTimeSelect from "@/components/datatable/inline-time-select";
import { Button, Switch } from "@/components/primitives";
import {
  formatOrgTime,
  resolveTimeDisplayFormat,
} from "@/helpers/time-format";
import { useTenant } from "@/hooks/useTenant";
import {
  CONSULTATION_DEFAULT_WINDOW,
  CONSULTATION_WEEKDAY_LABELS,
  type WhitelistScheduleValidationError,
} from "@/lib/consultation/whitelist-schedule";
import { resolveListItemPresence } from "@/lib/sj/motion";
import {
  CONSULTATION_WEEKDAY_KEYS,
  type ConsultationDaySchedule,
  type ConsultationWeekdayKey,
} from "@/types/consultation";
import { Plus, Trash } from "iconoir-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

function validationMessageForWindow(
  errors: WhitelistScheduleValidationError[],
  day: ConsultationWeekdayKey,
  windowIndex: number,
): string | undefined {
  return errors.find((e) => e.day === day && e.windowIndex === windowIndex)
    ?.message;
}

export function CustomWhitelistSchedule({
  draft,
  readOnly = false,
  isBusy = false,
  validationErrors = [],
  onUpdateDay,
}: {
  draft: Record<ConsultationWeekdayKey, ConsultationDaySchedule>;
  readOnly?: boolean;
  isBusy?: boolean;
  validationErrors?: WhitelistScheduleValidationError[];
  onUpdateDay: (
    day: ConsultationWeekdayKey,
    updater: (current: ConsultationDaySchedule) => ConsultationDaySchedule,
  ) => void;
}) {
  const { tenant } = useTenant();
  const timeFormat = resolveTimeDisplayFormat(tenant?.time_display_format);
  const reducedMotion = useReducedMotion();
  const presence = resolveListItemPresence(reducedMotion);

  return (
    <div className="w-1/2 divide-y divide-border rounded-md border border-border">
      {CONSULTATION_WEEKDAY_KEYS.map((day) => {
        const dayConfig = draft[day];
        const isEnabled = dayConfig.enabled;

        return (
          <div key={day} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {CONSULTATION_WEEKDAY_LABELS[day]}
              </span>
              <Switch
                checked={dayConfig.enabled}
                disabled={readOnly || isBusy}
                className="shrink-0"
                onCheckedChange={(checked) =>
                  onUpdateDay(day, (current) => ({
                    ...current,
                    enabled: checked,
                    windows:
                      checked && current.windows.length === 0
                        ? [{ ...CONSULTATION_DEFAULT_WINDOW }]
                        : current.windows,
                  }))
                }
                aria-label={`${CONSULTATION_WEEKDAY_LABELS[day]} available`}
              />
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              {isEnabled ? (
                <motion.div
                  key={`${day}-windows`}
                  layout={!reducedMotion}
                  variants={presence}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex flex-col gap-2 motion-reduce:transition-none"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {dayConfig.windows.map((window, index) => {
                      const errorMessage = validationMessageForWindow(
                        validationErrors,
                        day,
                        index,
                      );
                      return (
                        <motion.div
                          key={`${day}-${index}`}
                          layout={!reducedMotion}
                          variants={presence}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="flex flex-col gap-1 motion-reduce:transition-none"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {readOnly ? (
                              <span>{formatOrgTime(window.start, timeFormat)}</span>
                            ) : (
                              <InlineTimeSelect
                                value={window.start}
                                isDisabled={isBusy}
                                aria-label={`${CONSULTATION_WEEKDAY_LABELS[day]} start time`}
                                onChange={(time) =>
                                  onUpdateDay(day, (current) => ({
                                    ...current,
                                    windows: current.windows.map((w, i) =>
                                      i === index ? { ...w, start: time } : w,
                                    ),
                                  }))
                                }
                              />
                            )}
                            <span className="text-sm text-muted-foreground">to</span>
                            {readOnly ? (
                              <span>{formatOrgTime(window.end, timeFormat)}</span>
                            ) : (
                              <InlineTimeSelect
                                value={window.end}
                                isDisabled={isBusy}
                                aria-label={`${CONSULTATION_WEEKDAY_LABELS[day]} end time`}
                                onChange={(time) =>
                                  onUpdateDay(day, (current) => ({
                                    ...current,
                                    windows: current.windows.map((w, i) =>
                                      i === index ? { ...w, end: time } : w,
                                    ),
                                  }))
                                }
                              />
                            )}
                            {!readOnly && dayConfig.windows.length > 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                disabled={isBusy}
                                aria-label="Remove time range"
                                onClick={() =>
                                  onUpdateDay(day, (current) => ({
                                    ...current,
                                    windows: current.windows.filter(
                                      (_, i) => i !== index,
                                    ),
                                  }))
                                }
                              >
                                <Trash className="size-4" aria-hidden />
                              </Button>
                            ) : null}
                          </div>
                          {errorMessage ? (
                            <p className="text-xs text-destructive">{errorMessage}</p>
                          ) : null}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit gap-1"
                      disabled={isBusy}
                      onClick={() =>
                        onUpdateDay(day, (current) => ({
                          ...current,
                          windows: [
                            ...current.windows,
                            { ...CONSULTATION_DEFAULT_WINDOW },
                          ],
                        }))
                      }
                    >
                      <Plus className="size-4" aria-hidden />
                      Add time range
                    </Button>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
