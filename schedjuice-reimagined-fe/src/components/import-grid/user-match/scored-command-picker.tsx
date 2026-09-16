"use client";

import type { ReactNode } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/misc/command";
import { cn } from "@/lib/utils";

export type ScoredPickerItem = {
  id: number;
  title: string;
  subtitle?: string;
  score?: number | null;
  scoreLabel?: string;
};

type Props = {
  contextLabel: ReactNode;
  contextDetail?: string;
  query: string;
  placeholder?: string;
  suggestions: ScoredPickerItem[];
  searchResults: ScoredPickerItem[];
  isSearching?: boolean;
  compact?: boolean;
  listMaxHeightClass?: string;
  emptyText?: string;
  footer?: React.ReactNode;
  onQueryChange: (query: string) => void;
  onSelect: (id: number) => void;
  className?: string;
};

export function ScoredCommandPicker({
  contextLabel,
  contextDetail,
  query,
  placeholder = "Search…",
  suggestions,
  searchResults,
  isSearching = false,
  compact = false,
  listMaxHeightClass,
  emptyText = "No matches.",
  footer,
  onQueryChange,
  onSelect,
  className,
}: Props) {
  const list = searchResults.length > 0 ? searchResults : suggestions;

  return (
    <div className={cn(compact ? "text-xs" : undefined, className)}>
      <div
        className={cn(
          "border-b bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100",
          compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs",
        )}
      >
        {contextLabel}
        {contextDetail ? (
          <span className={compact ? " ml-1 opacity-80" : " ml-1"}>{contextDetail}</span>
        ) : null}
      </div>
      <Command shouldFilter={false} className={cn(compact && "rounded-md border text-xs")}>
        <CommandInput
          value={query}
          onValueChange={onQueryChange}
          placeholder={placeholder}
          className={compact ? "h-8 text-xs" : undefined}
        />
        <CommandList className={listMaxHeightClass ?? (compact ? "max-h-28" : undefined)}>
          <CommandEmpty
            className={cn(
              "text-center text-muted-foreground",
              compact ? "px-3 py-3 text-xs text-text-secondary" : "py-6 text-sm",
            )}
          >
            {isSearching ? "Searching…" : emptyText}
          </CommandEmpty>
          <CommandGroup>
            {list.map((item) => (
              <CommandItem
                key={item.id}
                value={String(item.id)}
                className={compact ? "py-1.5 text-xs" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onSelect={() => onSelect(item.id)}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("truncate", compact ? "font-medium" : "text-sm")}>
                    {item.title}
                  </span>
                  {item.subtitle ? (
                    <span
                      className={cn(
                        "truncate text-muted-foreground",
                        compact ? "text-[10px] text-text-secondary" : "text-[11px]",
                      )}
                    >
                      {item.subtitle}
                    </span>
                  ) : null}
                </div>
                {item.score != null ? (
                  <span className="ml-auto shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {item.scoreLabel ?? `${Math.round(item.score)}%`}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      {footer}
    </div>
  );
}
