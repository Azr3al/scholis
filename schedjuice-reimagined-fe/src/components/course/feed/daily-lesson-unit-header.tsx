"use client";

import { useEffect, useId, useRef } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Checkbox } from "@/components/primitives";
import { Field } from "@/components/primitives";
import { cn } from "@/lib/utils";

export function DailyLessonUnitHeader({
  registration,
  error,
  autoFocus,
  onEnter,
  ineligible,
  onIneligibleChange,
  inputDisabled = false,
}: {
  registration: UseFormRegisterReturn;
  error?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  ineligible: boolean;
  onIneligibleChange: (checked: boolean) => void;
  inputDisabled?: boolean;
}) {
  const inputId = useId();
  const ineligibleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { ref: registerRef, ...registerRest } = registration;

  useEffect(() => {
    if (autoFocus && !inputDisabled) {
      inputRef.current?.focus();
    }
  }, [autoFocus, inputDisabled]);

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1 block text-xs text-muted-foreground"
      >
        Which unit did you cover today?
      </label>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 text-lg font-medium text-foreground">
          <span>Unit</span>
          <input
            {...registerRest}
            id={inputId}
            ref={(el) => {
              inputRef.current = el;
              registerRef(el);
            }}
            type="number"
            min={1}
            inputMode="numeric"
            disabled={inputDisabled}
            aria-label="Unit number covered today"
            className={cn(
              "w-[4ch] bg-transparent border-0 outline-none focus:ring-0 p-0",
              "text-lg font-medium text-center tabular-nums",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "underline decoration-destructive decoration-2",
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Tab") {
                if (e.key === "Enter") e.preventDefault();
                onEnter?.();
              }
            }}
          />
          <span>covered today</span>
        </div>
        <Field.Root className="flex flex-row items-center gap-2">
          <Checkbox
            id={ineligibleId}
            checked={ineligible}
            onCheckedChange={(checked) => onIneligibleChange(checked === true)}
          />
          <Field.Label
            htmlFor={ineligibleId}
            className="text-sm text-muted-foreground font-normal cursor-pointer"
          >
            Ineligible
          </Field.Label>
        </Field.Root>
      </div>
      {error ? (
        <p className="text-sm text-destructive mt-0.5">{error}</p>
      ) : null}
    </div>
  );
}
