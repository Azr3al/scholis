import { Button, Popover, buttonVariants } from "@/components/primitives";
import { Calendar as CalendarComponent } from "@/components/date/calendar";
import { WeekdayAnimalIcon } from "@/components/icons/weekday-animal-icons";
import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { NavArrowLeft as ChevronLeftIcon, NavArrowRight as ChevronRightIcon } from "iconoir-react";
import { formatDate } from "@/helpers/date";
import { CalendarView, RecurringMode, weekdayNames } from "./types";
import { addDays, addMonths, startOfWeek, endOfWeek } from "date-fns";
import { useCalendar } from "./calendar-context";
import { useEffect, useMemo, useState } from "react";
import { eventType } from "@/types/course";
import { Checkbox, Radio, RadioGroup } from "@/components/primitives";

export const CalendarMenu: React.FC = () => {
  const [selectedWeekdays, setSelectedWeekdays] = useState<typeof weekdayNames>(
    [],
  );

  const {
    currentDate,
    setCurrentDate,
    currentView,
    setCurrentView,
    recurringMode,
    setRecurringMode,
    setSelectedEvents,
    events,
    selectedEvents,
    showableViews,
    showRecurringMode,
  } = useCalendar();

  const viewsForSegmented = useMemo(() => {
    const order = [CalendarView.WEEK, CalendarView.MONTH, CalendarView.LIST];
    return order.filter((v) => showableViews.includes(v));
  }, [showableViews]);

  const handlePrevious = () => {
    if (currentView === CalendarView.MONTH) {
      setCurrentDate(addMonths(currentDate, -1));
    } else if (currentView === CalendarView.WEEK) {
      setCurrentDate(addDays(currentDate, -7));
    }
  };

  const handleNext = () => {
    if (currentView === CalendarView.MONTH) {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (currentView === CalendarView.WEEK) {
      setCurrentDate(addDays(currentDate, 7));
    }
  };

  const getDateDisplay = () => {
    if (currentView === CalendarView.MONTH) {
      return formatDate(currentDate, "MMMM");
    }
    if (currentView === CalendarView.WEEK) {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      return `${formatDate(weekStart, "MMM d")} - ${formatDate(weekEnd, "MMM d")}`;
    }
    if (currentView === CalendarView.LIST) {
      return formatDate(currentDate, "MMMM yyyy");
    }
    return formatDate(currentDate, "MMMM yyyy");
  };

  useEffect(() => {
    if (recurringMode === RecurringMode.WEEKLY && showRecurringMode) {
      const eventsToSelect: eventType[] = [];
      Object.keys(events).forEach((event) => {
        events[event].forEach((e) => {
          const eventDate = new Date(e.date as string | Date);
          const eventDay = eventDate.getDay();
          if (selectedWeekdays.includes(weekdayNames[eventDay])) {
            eventsToSelect.push(e as eventType);
          }
        });
      });
      setSelectedEvents?.(eventsToSelect);
    }
  }, [selectedWeekdays, recurringMode, showRecurringMode, events, setSelectedEvents]);

  useEffect(() => {
    if (recurringMode === RecurringMode.ALL_DAYS && showRecurringMode) {
      setSelectedEvents?.(Object.values(events).flat() as eventType[]);
    }
  }, [recurringMode, showRecurringMode, events, setSelectedEvents]);

  return (
    <div className="space-y-3">
      {showRecurringMode ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-8">
          <div className="space-y-3">
            <label className="font-bold">Recurring Mode</label>
            <RadioGroup
              onValueChange={(value) =>
                setRecurringMode(value as RecurringMode)
              }
              value={recurringMode}
              className="mt-3 flex flex-row items-center gap-3"
            >
              {Object.values(RecurringMode).map((mode) => (
                <div className="flex items-center gap-2" key={mode}>
                  <Radio id={`recurring-mode-${mode}`} value={mode} />
                  <label
                    htmlFor={`recurring-mode-${mode}`}
                    className="capitalize"
                  >
                    {mode.replace("_", " ")}
                  </label>
                </div>
              ))}
            </RadioGroup>
            <div
              className={cn({
                "invisible pointer-events-none":
                  recurringMode !== RecurringMode.WEEKLY,
              })}
              aria-hidden={recurringMode !== RecurringMode.WEEKLY}
            >
              <label className="font-bold">Weekdays</label>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.values(weekdayNames).map((weekday) => (
                  <div className="flex items-center gap-2" key={weekday}>
                    <Checkbox
                      id={`weekday-${weekday}`}
                      checked={selectedWeekdays.includes(weekday)}
                      disabled={recurringMode !== RecurringMode.WEEKLY}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedWeekdays([...selectedWeekdays, weekday]);
                        } else {
                          setSelectedWeekdays(
                            selectedWeekdays.filter((day) => day !== weekday),
                          );
                        }
                      }}
                    />
                    <label
                      htmlFor={`weekday-${weekday}`}
                      className="flex items-center gap-1.5 capitalize"
                    >
                      <WeekdayAnimalIcon
                        day={weekday}
                        className="size-4.5 shrink-0"
                      />
                      {weekday.replace("_", " ")}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <p>
              <span className="font-bold">{selectedEvents?.length ?? 0}</span>{" "}
              timeslots selected
            </p>
            <Button
              onClick={() => {
                setSelectedEvents?.([]);
              }}
              variant="secondary"
            >
              clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrevious}>
              <ChevronLeftIcon />
            </Button>
            <Popover.Root modal={true}>
              <Popover.Trigger
                type="button"
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "min-w-46 justify-center tabular-nums",
                )}
              >
                {getDateDisplay()}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner className={dropdownPositionerClassName}>
                  <Popover.Popup>
                    <CalendarComponent
                      mode="single"
                      selected={currentDate}
                      onSelect={(date) => date && setCurrentDate(date)}
                      initialFocus
                    />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
            <Button variant="ghost" size="sm" onClick={handleNext}>
              <ChevronRightIcon />
            </Button>
          </div>
          {viewsForSegmented.length > 1 ? (
            <div className="flex flex-wrap items-center">
              {viewsForSegmented.map((view) => (
                <Button
                  key={view}
                  variant={currentView === view ? "primary" : "secondary"}
                  className="rounded-none first:rounded-l-md last:rounded-r-md capitalize"
                  onClick={() => setCurrentView(view)}
                >
                  {view === CalendarView.LIST ? "List" : view}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
