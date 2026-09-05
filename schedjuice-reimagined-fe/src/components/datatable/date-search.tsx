"use client";
import { Button, Popover, Select, buttonVariants } from "@/components/primitives";
import { Calendar } from "@/components/date/calendar";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "iconoir-react";

import { cn } from "@/lib/utils";
import { dropdownPositionerClassName } from "@/lib/ui/overlay-classnames";
import { operatorEnum } from "@/types/api";

interface IDateSearchProps {
  name: string;
  onChange: (value: any) => void;
  value: {
    date: (Date | undefined) | { from: Date | undefined; to: Date | undefined };
    operator: "between" | "lt" | "gt";
  };
  operatorOnchange: (operator: any) => void;
}
const DateSearch: React.FC<IDateSearchProps> = ({
  onChange,
  value,
  name,
  operatorOnchange,
}) => {
  return (
    <>
      <div className="sm:w-auto w-72 flex items-center gap-2 p-2 border border-border rounded">
        <Popover.Root>
          <Popover.Trigger
            type="button"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "w-44 justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value.date ? (
              value.operator === "between" ? (
                // @ts-ignore
                value.date.from &&
                // @ts-ignore
                value.date.to ? ( // @ts-ignore
                  `${format(value.date.from, "dd-MM-yyyy")} - ${format(
                    // @ts-ignore
                    value.date.to,
                    "dd-MM-yyyy"
                  )}`
                ) : (
                  <span>Pick a range</span>
                )
              ) : (
                // @ts-ignore
                format(value.date, "LLL d yyyy")
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className={dropdownPositionerClassName}>
              <Popover.Popup className="w-auto p-0">
            {/* @ts-ignore */}
            <Calendar
              mode={value.operator === "between" ? "range" : "single"}
              onSelect={onChange}
              selected={value.date}
              initialFocus
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
        </Popover.Root>
        <Select
          value={value.operator}
          onValueChange={(v) => operatorOnchange(String(v ?? ""))}
          className="w-[120px]"
          items={[
            { value: operatorEnum.gt, label: "Greater than" },
            { value: operatorEnum.lt, label: "Less than" },
            { value: "between", label: "Between (inclusive)" },
          ]}
        />
      </div>
    </>
  );
};

export default DateSearch;
