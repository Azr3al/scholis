import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SpinnerProps = ComponentProps<"svg">;

export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      className={cn(
        "size-4 shrink-0 animate-spin motion-reduce:animate-none",
        className,
      )}
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
