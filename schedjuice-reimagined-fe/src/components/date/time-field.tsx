"use client";

import { cn } from "@/lib/utils";
import {
  DateInput,
  DateSegment,
  TimeField as AriaTimeField,
  type TimeFieldProps as AriaTimeFieldProps,
  type TimeValue,
} from "react-aria-components";

function TimeField<T extends TimeValue>({
  className,
  ...props
}: AriaTimeFieldProps<T> & { className?: string }) {
  return (
    <AriaTimeField
      {...props}
      className={cn(
        "inline-flex h-10 min-w-0 flex-1 items-center",
        props.isDisabled ? "cursor-not-allowed opacity-50" : "",
        className,
      )}
    >
      <DateInput
        className={cn(
          "inline-flex h-full min-w-0 flex-1 items-center bg-transparent px-0 text-base text-text-primary tabular-nums",
          "outline-none",
        )}
      >
        {(segment) => (
          <DateSegment
            segment={segment}
            className={(seg) =>
              cn(
                "rounded px-0.5 tabular-nums outline-none caret-transparent",
                seg.isPlaceholder ? "text-text-muted" : "text-text-primary",
                seg.type === "literal" && "px-0.5 text-text-muted",
                seg.isFocused &&
                  "bg-[var(--action,var(--data-green-strong,#2f6e58))] text-[var(--action-foreground,#ffffff)]",
              )
            }
          />
        )}
      </DateInput>
    </AriaTimeField>
  );
}

export { TimeField };
export type { TimeValue };
