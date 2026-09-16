import { Button, buttonVariants } from "@/components/primitives";
import React from "react";
import clsx from "clsx";
import { formatForCalendarCell } from "@/helpers/date";
import { EditPencil as SquarePen } from "iconoir-react";
import { cn } from "@/lib/utils";
interface HolidayList {
  date: Date;
  title: string;
  isClassOpen: boolean;
  calendarName: string;
}

const HolidayListCard: React.FC<HolidayList> = ({
  date,
  title,
  isClassOpen,
  calendarName,
}) => {
  const { day, weekdayShort } = formatForCalendarCell(date);

  return (
    <div className="px-3 py-2 bg-background m-2 ">
      <div className="flex items-center gap-4 ">
        {/* left status dot */}
        <span
          className={cn({
            "h-2.5 w-2.5 rounded-full": true,
            "bg-green-500": isClassOpen,
            "bg-red-500": !isClassOpen,
          })}
          aria-hidden
        />

        {/* date block */}
        <div className="w-10 text-center">
          <div className="text-xl font-semibold leading-none text-slate-900">
            {day}
          </div>
          <div className="text-[12px] leading-none text-slate-500 mt-1">
            {weekdayShort}
          </div>
        </div>

        {/* title + calendar name */}
        <div className="min-w-0 flex-col ">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-xs text-slate-500 truncate mt-1">
            {calendarName ? `${calendarName}` : `Myanmar ${title}`}
          </div>
        </div>
        <div className="ml-24 ">
          <span
            className={cn({
              "inline-flex w-28 items-center rounded-md border px-2.5 py-1.5 text-sm font-normal":
                true,
              "bg-green-50 text-green-700 border-green-300": isClassOpen,
              "bg-orange-50 text-orange-700 border-orange-300": !isClassOpen,
            })}
          >
            {isClassOpen ? "Classes Open" : "Classes Closed"}
          </span>
        </div>

        {/* right: pill + edit */}
        <div className="flex items-center gap-3 ml-auto ">
          <Button variant="secondary" size="sm">
            <SquarePen className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HolidayListCard;
