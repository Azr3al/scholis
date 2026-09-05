"use client";

import * as React from "react";

import { SearchField } from "@/components/form/search-field";
import { cn } from "@/lib/utils";

export function comboboxSearchPlaceholder(
  label: string,
  placeholder?: string,
): string {
  return placeholder ?? `Search ${label}…`;
}

export function comboboxSearchAriaLabel(label: string): string {
  return `Search ${label}`;
}

export type ComboboxSearchHeaderProps = {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  isFetching?: boolean;
  autoFocus?: boolean;
  className?: string;
  searchMode?: "filter" | "search";
};

export function ComboboxSearchHeader({
  label,
  value,
  onChange,
  placeholder,
  isFetching = false,
  autoFocus = true,
  className,
  searchMode = "filter",
}: ComboboxSearchHeaderProps) {
  const resolvedPlaceholder = comboboxSearchPlaceholder(label, placeholder);
  const showHint = value.trim().length === 0;
  const hintText =
    searchMode === "search" ? "Type to search people" : "Type to filter the list";

  return (
    <div className={cn("border-b border-border/60 p-3", className)}>
      <SearchField
        value={value}
        onChange={onChange}
        placeholder={resolvedPlaceholder}
        ariaLabel={comboboxSearchAriaLabel(label)}
        isFetching={isFetching}
        autoFocus={autoFocus}
        className="h-11"
      />
      {showHint ? (
        <p aria-hidden className="mt-1.5 px-0.5 text-xs text-text-muted">
          {hintText}
        </p>
      ) : null}
    </div>
  );
}
