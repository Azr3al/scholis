"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useEffect, useId, useMemo, useState } from "react";
import { Check, NavArrowDown, Search } from "iconoir-react";

import { ComboboxOptionRowsSkeleton } from "@/components/form/combobox-option-rows-skeleton";
import { ComboboxSearchHeader } from "@/components/form/combobox-search-header";
import {
  AsyncContentPanel,
  AsyncContentPanelRow,
  type AsyncPanelState,
} from "@/components/loading/async-content-panel";
import { buttonVariants } from "@/components/primitives/button";
import { InputLoadingPlaceholder } from "@/components/primitives/input-loading-placeholder";
import { Popover } from "@/components/primitives/popover";
import type { FilterFieldLayout } from "@/components/filters/filter-toolbar";
import { filterComboboxOptionsByQuery } from "@/components/form/filter-combobox-options";
import { cn } from "@/lib/utils";

export type EntityComboboxOption = {
  value: string;
  label: string;
  searchText?: string;
};

type EntityComboboxListProps = {
  options?: EntityComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  /** Legacy alias for `onChange` (matches ui/combo-box). */
  setValue?: (value: string) => void;
  label: string;
  isLoading?: boolean;
  disabled?: boolean;
  isSaving?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  contentClassName?: string;
  allowDeselect?: boolean;
  /** Display label for the current value when it is not in `options` (e.g. server search). */
  selectedLabel?: string;
  /** When true, options come from the server; search input calls `onFilterChange`. */
  serverSideFilter?: boolean;
  onFilterChange?: (filter: string) => void;
  onOpenChange?: (open: boolean) => void;
  layout?: FilterFieldLayout;
  variant?: "combobox" | "search";
  /** Fetch/load error message; drives the async panel error state. */
  error?: string | null;
  /** Accessible name when the visible label is hidden. */
  triggerAriaLabel?: string;
  /** Animated shimmer placeholder while a value is loading (shown only when empty). */
  loadingPlaceholder?: string;
  loadingPlaceholderActive?: boolean;
};

function deriveListPanelState(
  isLoading: boolean,
  optionCount: number,
  error?: string | null,
): AsyncPanelState {
  if (error) return "error";
  if (isLoading && optionCount === 0) return "loading";
  if (optionCount === 0) return "empty";
  return "ready";
}

export function EntityComboboxList({
  options,
  value,
  onChange,
  setValue,
  label,
  isLoading = false,
  disabled = false,
  isSaving = false,
  placeholder,
  triggerClassName,
  contentClassName,
  allowDeselect = true,
  selectedLabel: selectedLabelOverride,
  serverSideFilter = false,
  onFilterChange,
  onOpenChange,
  layout = "form",
  variant = "combobox",
  error = null,
  triggerAriaLabel,
  loadingPlaceholder,
  loadingPlaceholderActive = false,
}: EntityComboboxListProps) {
  const handleChange = onChange ?? setValue;
  if (!handleChange) {
    throw new Error("EntityComboboxList requires onChange or setValue");
  }

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const listboxId = useId();
  const showLoadingPlaceholder = Boolean(
    loadingPlaceholder &&
      loadingPlaceholderActive &&
      (value === "" || value === undefined),
  );
  const triggerDisabled = disabled || isSaving || loadingPlaceholderActive;
  const isSearchVariant = variant === "search";
  const resolvedPlaceholder = placeholder ?? `Select ${label}`;
  const savingLabel = isSearchVariant ? "Adding…" : "Saving…";

  useEffect(() => {
    if (isSaving) {
      setOpen(false);
    }
  }, [isSaving]);

  const selectedLabel = useMemo(() => {
    const selected = options?.find((option) => String(option.value) === String(value));
    if (selected) return selected.label;
    if (selectedLabelOverride) return selectedLabelOverride;
    if (value === "" || value === undefined) {
      return resolvedPlaceholder;
    }
    return String(value);
  }, [options, resolvedPlaceholder, selectedLabelOverride, value]);

  const showPlaceholderStyle =
    !isSaving &&
    !showLoadingPlaceholder &&
    (value === "" || value === undefined) &&
    !selectedLabelOverride &&
    !options?.find((option) => String(option.value) === String(value));

  const filteredOptions = useMemo(() => {
    if (serverSideFilter) return options ?? [];
    return filterComboboxOptionsByQuery(options ?? [], filter);
  }, [filter, options, serverSideFilter]);

  const panelState =
    error
      ? "error"
      : isLoading && serverSideFilter && filteredOptions.length === 0
        ? "loading"
        : deriveListPanelState(isLoading, filteredOptions.length, error);

  const setOpenAndNotify = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setFilter("");
      onFilterChange?.("");
    }
  };

  const triggerButtonClassName = isSearchVariant
    ? cn(
        "relative flex h-10 w-full items-center rounded-md border border-border bg-surface py-2 pr-9 pl-9 text-sm",
        "focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        loadingPlaceholder && "relative",
        triggerClassName,
      )
    : cn(
        buttonVariants({ size: "sm", variant: "secondary" }),
        layout === "toolbar" ? "h-10" : "h-9",
        "w-full min-w-0 max-w-full justify-between gap-2 text-left",
        loadingPlaceholder && "relative",
        triggerClassName,
      );

  return (
    <Popover.Root
      open={triggerDisabled ? false : open}
      onOpenChange={(next) => {
        if (triggerDisabled) return;
        setOpenAndNotify(next);
      }}
    >
      <Popover.Trigger
        render={
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-busy={isSaving || loadingPlaceholderActive || undefined}
            aria-label={triggerAriaLabel}
            disabled={triggerDisabled}
            className={triggerButtonClassName}
          />
        }
      >
        {loadingPlaceholder ? (
          <InputLoadingPlaceholder show={showLoadingPlaceholder}>
            {loadingPlaceholder}
          </InputLoadingPlaceholder>
        ) : null}
        {isSearchVariant ? (
          <>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <span className="min-w-0 flex-1 truncate text-left">
              {isSaving ? (
                <span className="text-text-muted">{savingLabel}</span>
              ) : showLoadingPlaceholder ? (
                <span aria-hidden className="invisible">
                  {resolvedPlaceholder}
                </span>
              ) : showPlaceholderStyle ? (
                <span className="text-text-muted">{resolvedPlaceholder}</span>
              ) : (
                selectedLabel
              )}
            </span>
            <Spinner
              aria-hidden
              className={cn(
                "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted",
                isSaving ? "opacity-100" : "opacity-0",
              )}
            />
          </>
        ) : (
          <>
            <span
              className="min-w-0 flex-1 truncate"
              title={
                isSaving || showLoadingPlaceholder ? undefined : selectedLabel
              }
            >
              {isSaving ? (
                savingLabel
              ) : showLoadingPlaceholder ? (
                <span aria-hidden className="invisible">
                  {resolvedPlaceholder}
                </span>
              ) : showPlaceholderStyle ? (
                <span className="text-text-muted">{resolvedPlaceholder}</span>
              ) : (
                selectedLabel
              )}
            </span>
            <span className="relative size-4 shrink-0" aria-hidden>
              <Spinner
                className={cn(
                  "absolute inset-0",
                  isSaving || isLoading ? "opacity-100" : "opacity-0",
                )}
              />
              <NavArrowDown
                width={16}
                height={16}
                className={cn(
                  "absolute inset-0",
                  isSaving || isLoading ? "opacity-0" : "opacity-60",
                )}
              />
            </span>
          </>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={4}>
          <Popover.Popup
            id={listboxId}
            className={cn(
              "min-w-[max(var(--anchor-width),14rem)] w-max max-w-[min(100vw-2rem,32rem)] p-0",
              contentClassName,
            )}
          >
            <ComboboxSearchHeader
              label={label}
              placeholder={placeholder}
              value={filter}
              onChange={(event) => {
                const next = event.target.value;
                setFilter(next);
                onFilterChange?.(next);
              }}
              isFetching={
                serverSideFilter
                  ? isLoading
                  : isLoading && (options?.length ?? 0) === 0
              }
              searchMode={serverSideFilter ? "search" : "filter"}
            />
            <AsyncContentPanel
              state={panelState}
              ariaBusy={isLoading}
              stableHeight="popover"
              className="rounded-none border-0"
              loading={<ComboboxOptionRowsSkeleton rows={5} />}
              empty="No item found."
              error={error ?? "Couldn't load results."}
              staggerResults
            >
              <div className="divide-y divide-border/60">
                {filteredOptions.map((option) => {
                  const isSelected = String(value) === String(option.value);
                  return (
                    <AsyncContentPanelRow key={option.value}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-text-primary",
                          "hover:bg-accent hover:text-accent-foreground",
                          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]",
                        )}
                        title={option.label}
                        onClick={() => {
                          const nextValue =
                            allowDeselect && isSelected ? "" : String(option.value);
                          handleChange(nextValue);
                          setOpenAndNotify(false);
                        }}
                      >
                        <Check
                          width={16}
                          height={16}
                          aria-hidden
                          className={cn("shrink-0", isSelected ? "opacity-100" : "opacity-0")}
                        />
                        <span className="min-w-0 flex-1 whitespace-normal break-words">
                          {option.label}
                        </span>
                      </button>
                    </AsyncContentPanelRow>
                  );
                })}
              </div>
            </AsyncContentPanel>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
