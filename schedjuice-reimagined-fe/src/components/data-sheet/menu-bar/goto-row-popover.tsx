"use client";
import { Button, Popover, buttonVariants } from "@/components/primitives";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function GotoRowPopover({
  open,
  onOpenChange,
  rowCount,
  onGo,
  icon,
  label,
  compact = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowCount: number;
  onGo: (row: number) => void;
  icon: ReactNode;
  label: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setError(false);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const submit = () => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > rowCount) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    onGo(n);
    onOpenChange(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 text-[11px] text-foreground/70 active:scale-[0.96]",
              compact ? "px-1.5" : "px-2",
            )}
            title={label}
            aria-label={label}
            disabled={rowCount === 0}
          >
            {icon}
            {!compact ? <span>{label}</span> : null}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner align="start">
        <Popover.Popup className="w-56 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2"
        >
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-foreground"
          >
            Go to row
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="number"
            inputMode="numeric"
            min={1}
            max={rowCount}
            value={value}
            placeholder={`1 \u2013 ${rowCount}`}
            aria-invalid={error}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(false);
            }}
            className={cn(
              "h-8 w-full rounded-md border bg-transparent px-2.5 text-sm tabular-nums outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
              error ? "border-destructive" : "border-input",
            )}
          />
          <div className="flex justify-end gap-2 pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs active:scale-[0.97]"
            >
              Go
            </Button>
          </div>
        </form>
      </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
