"use client";

import { type ComponentProps } from "react";
import { InputLoadingPlaceholder } from "@/components/primitives/input-loading-placeholder";
import { cn } from "@/lib/utils";

export const inputClassName =
  "h-10 w-full rounded-md border border-border-strong bg-surface-sunken px-3 text-base text-text-primary " +
  "placeholder:text-text-muted transition-colors duration-[var(--duration-fast)] " +
  "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)] " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export type InputProps = ComponentProps<"input"> & {
  /** Animated shimmer placeholder while a value is loading (shown only when the input is empty). */
  loadingPlaceholder?: string;
  /** When true with `loadingPlaceholder`, shows the animated placeholder overlay. */
  loadingPlaceholderActive?: boolean;
};

function isInputValueEmpty(
  value: InputProps["value"],
  defaultValue: InputProps["defaultValue"],
): boolean {
  const current = value !== undefined ? value : defaultValue;
  return current === undefined || current === null || current === "";
}

export function Input({
  className,
  type = "text",
  loadingPlaceholder,
  loadingPlaceholderActive = false,
  placeholder,
  value,
  defaultValue,
  ...props
}: InputProps) {
  const showLoadingPlaceholder = Boolean(
    loadingPlaceholder &&
      loadingPlaceholderActive &&
      isInputValueEmpty(value, defaultValue),
  );

  const input = (
    <input
      type={type}
      className={cn(inputClassName, className)}
      placeholder={showLoadingPlaceholder ? undefined : placeholder}
      value={value}
      defaultValue={defaultValue}
      aria-busy={showLoadingPlaceholder || undefined}
      {...props}
    />
  );

  if (!loadingPlaceholder) {
    return input;
  }

  return (
    <div className="relative w-full min-w-0">
      {input}
      <InputLoadingPlaceholder show={showLoadingPlaceholder}>
        {loadingPlaceholder}
      </InputLoadingPlaceholder>
    </div>
  );
}
