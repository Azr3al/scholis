"use client";
import { Button, Select, buttonVariants } from "@/components/primitives";
import { DatePicker } from "@/components/date/date-picker";

import { format, parse } from "date-fns";
import {
  DATE_RANGE_PRESET_IDS,
  DATE_RANGE_PRESET_LABELS,
  type DateRangePreset,
} from "@/helpers/date-range-presets";
import {
  filterToolbarFieldStackClassName,
  filterToolbarLabelClassName,
  type FilterFieldLayout,
} from "@/components/filters/filter-toolbar";
import { cn } from "@/lib/utils";

export type DateRangeFilterProps = {
  preset: DateRangePreset;
  /** nuqs setters return Promise<URLSearchParams>; `unknown` keeps typings practical. */
  onPresetChange: (preset: DateRangePreset) => unknown;
  customFrom: string | null | undefined;
  customTo: string | null | undefined;
  onCustomFromChange: (value: string | null) => unknown;
  onCustomToChange: (value: string | null) => unknown;
  /** If set, only these presets show as buttons (must include "custom" if you want custom range). */
  presetIds?: readonly DateRangePreset[];
  className?: string;
  fromInputId?: string;
  toInputId?: string;
};

export function DateRangeFilter({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  presetIds = DATE_RANGE_PRESET_IDS,
  className,
  fromInputId = "date-range-from",
  toInputId = "date-range-to",
}: DateRangeFilterProps) {
  const buttons = presetIds.map((id) => ({
    id,
    label: DATE_RANGE_PRESET_LABELS[id],
  }));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <Button
            key={b.id}
            type="button"
            size="sm"
            variant={preset === b.id ? "primary" : "secondary"}
            onClick={() => void onPresetChange(b.id)}
          >
            {b.label}
          </Button>
        ))}
      </div>
      {preset === "custom" ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <label htmlFor={fromInputId}>From</label>
            <div id={fromInputId} className="w-[min(100%,17rem)]">
              <DatePicker
                size="full"
                date={
                  customFrom
                    ? (() => {
                        try {
                          const d = parse(customFrom, "yyyy-MM-dd", new Date());
                          return Number.isNaN(d.getTime()) ? undefined : d;
                        } catch {
                          return undefined;
                        }
                      })()
                    : undefined
                }
                setDate={(d) =>
                  void onCustomFromChange(d ? format(d, "yyyy-MM-dd") : null)
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor={toInputId}>To</label>
            <div id={toInputId} className="w-[min(100%,17rem)]">
              <DatePicker
                size="full"
                date={
                  customTo
                    ? (() => {
                        try {
                          const d = parse(customTo, "yyyy-MM-dd", new Date());
                          return Number.isNaN(d.getTime()) ? undefined : d;
                        } catch {
                          return undefined;
                        }
                      })()
                    : undefined
                }
                setDate={(d) =>
                  void onCustomToChange(d ? format(d, "yyyy-MM-dd") : null)
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type DateRangePresetDropdownProps = {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => unknown;
  customFrom: string | null | undefined;
  customTo: string | null | undefined;
  onCustomFromChange: (value: string | null) => unknown;
  onCustomToChange: (value: string | null) => unknown;
  presetIds?: readonly DateRangePreset[];
  className?: string;
  label?: string;
  selectId?: string;
  fromInputId?: string;
  toInputId?: string;
  layout?: FilterFieldLayout;
};

export function DateRangePresetDropdown({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  presetIds = DATE_RANGE_PRESET_IDS,
  className,
  label = "Date range",
  selectId = "date-range-preset",
  fromInputId = "date-range-from",
  toInputId = "date-range-to",
  layout = "form",
}: DateRangePresetDropdownProps) {
  const isToolbar = layout === "toolbar";

  const customDateRow =
    preset === "custom" ? (
      <div
        className={cn(
          "flex flex-wrap items-end gap-4",
          isToolbar && "w-full basis-full",
        )}
      >
        <div className={isToolbar ? filterToolbarFieldStackClassName() : "space-y-2"}>
          <label
            htmlFor={fromInputId}
            className={isToolbar ? filterToolbarLabelClassName() : undefined}
          >
            From
          </label>
          <div id={fromInputId} className="w-[min(100%,17rem)]">
            <DatePicker
              size="full"
              date={
                customFrom
                  ? (() => {
                      try {
                        const d = parse(customFrom, "yyyy-MM-dd", new Date());
                        return Number.isNaN(d.getTime()) ? undefined : d;
                      } catch {
                        return undefined;
                      }
                    })()
                  : undefined
              }
              setDate={(d) =>
                void onCustomFromChange(d ? format(d, "yyyy-MM-dd") : null)
              }
            />
          </div>
        </div>
        <div className={isToolbar ? filterToolbarFieldStackClassName() : "space-y-2"}>
          <label
            htmlFor={toInputId}
            className={isToolbar ? filterToolbarLabelClassName() : undefined}
          >
            To
          </label>
          <div id={toInputId} className="w-[min(100%,17rem)]">
            <DatePicker
              size="full"
              date={
                customTo
                  ? (() => {
                      try {
                        const d = parse(customTo, "yyyy-MM-dd", new Date());
                        return Number.isNaN(d.getTime()) ? undefined : d;
                      } catch {
                        return undefined;
                      }
                    })()
                  : undefined
              }
              setDate={(d) =>
                void onCustomToChange(d ? format(d, "yyyy-MM-dd") : null)
              }
            />
          </div>
        </div>
      </div>
    ) : null;

  if (isToolbar) {
    return (
      <>
        <div className={cn(filterToolbarFieldStackClassName(), className)}>
          <label htmlFor={selectId} className={filterToolbarLabelClassName()}>
            {label}
          </label>
          <Select
            value={preset}
            onValueChange={(v) => void onPresetChange(v as DateRangePreset)}
            items={presetIds.map((id) => ({
              value: String(id),
              label: DATE_RANGE_PRESET_LABELS[id],
            }))}
            placeholder="Select range"
            className="w-[min(100%,14rem)]"
          />
        </div>
        {customDateRow}
      </>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="space-y-1.5">
        <label htmlFor={selectId}>{label}</label>
        <Select value={preset} onValueChange={(v) => void onPresetChange(v as DateRangePreset)} items={presetIds.map((id) => ({ value: String(id), label: DATE_RANGE_PRESET_LABELS[id] }))} placeholder='Select range' className='w-[min(100%,14rem)]' />
      </div>
      {customDateRow}
    </div>
  );
}
