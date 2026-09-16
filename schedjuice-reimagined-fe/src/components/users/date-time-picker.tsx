"use client";

import { inputClassName } from "@/components/primitives/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { forwardRef } from "react";

export type DateTimePickerProps = {
  date?: Date;
  setDate: (date?: Date) => void;
  disabled?: boolean;
  className?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
>;

export const DateTimePicker = forwardRef<HTMLInputElement, DateTimePickerProps>(
  function DateTimePickerCmp(
    { date, setDate, disabled = false, className, ...rest },
    ref,
  ) {
    return (
      <input
        ref={ref}
        type="datetime-local"
        disabled={disabled}
        className={cn(inputClassName, "w-full", className)}
        value={date ? format(new Date(date), "yyyy-MM-dd'T'HH:mm") : ""}
        onChange={(e) => {
          const v = e.target.value;
          setDate(v ? new Date(v) : undefined);
        }}
        {...rest}
      />
    );
  },
);
