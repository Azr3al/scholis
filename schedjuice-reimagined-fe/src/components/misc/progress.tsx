"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  HTMLDivElement,
  Omit<
    React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    "value"
  > & {
    value?: number;
  }
>(({ className, value = 0, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    value={value}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Track className="h-full w-full">
      <ProgressPrimitive.Indicator className="h-full bg-primary transition-all" />
    </ProgressPrimitive.Track>
  </ProgressPrimitive.Root>
));
Progress.displayName = "Progress";

export { Progress };
