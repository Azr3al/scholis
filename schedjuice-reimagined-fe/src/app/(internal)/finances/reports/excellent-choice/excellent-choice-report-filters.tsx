"use client";

import { DateRangePicker } from "@/components/date/date-range-picker";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import {
  FilterToolbar,
  FilterToolbarAction,
  FilterToolbarField,
} from "@/components/filters/filter-toolbar";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";

export type ExcellentChoiceFilterMode = "month" | "range";

function parseIsoDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  try {
    const d = parse(value, "yyyy-MM-dd", new Date());
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}

type ExcellentChoiceReportFiltersProps = {
  filterMode: ExcellentChoiceFilterMode;
  onFilterModeChange: (mode: ExcellentChoiceFilterMode) => void;
  monthDate: Date;
  onMonthDateChange: (date: Date) => void;
  dateFrom: string | null;
  dateTo: string | null;
  onDateFromChange: (value: string | null) => void;
  onDateToChange: (value: string | null) => void;
  onDownloadExcel: () => void;
  downloadDisabled: boolean;
  downloadLoading: boolean;
};

export function ExcellentChoiceReportFilters({
  filterMode,
  onFilterModeChange,
  monthDate,
  onMonthDateChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onDownloadExcel,
  downloadDisabled,
  downloadLoading,
}: ExcellentChoiceReportFiltersProps) {
  return (
    <FilterToolbar>
      <FilterToolbarField label="Filter by" width="auto">
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={filterMode === "month" ? "primary" : "ghost"}
            className={cn("h-7 px-2.5")}
            onClick={() => onFilterModeChange("month")}
          >
            Month
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filterMode === "range" ? "primary" : "ghost"}
            className={cn("h-7 px-2.5")}
            onClick={() => onFilterModeChange("range")}
          >
            Date range
          </Button>
        </div>
      </FilterToolbarField>

      {filterMode === "month" ? (
        <YearMonthSelector
          layout="toolbar"
          label="Month"
          date={monthDate}
          setDate={onMonthDateChange}
        />
      ) : (
        <FilterToolbarField label="Date range" width="lg">
          <DateRangePicker
            from={parseIsoDate(dateFrom)}
            to={parseIsoDate(dateTo)}
            onRangeChange={({ from, to }) => {
              void onDateFromChange(from ? format(from, "yyyy-MM-dd") : null);
              void onDateToChange(to ? format(to, "yyyy-MM-dd") : null);
            }}
          />
        </FilterToolbarField>
      )}

      <FilterToolbarAction>
        <Button
          onClick={onDownloadExcel}
          disabled={downloadDisabled}
          isLoading={downloadLoading}
        >
          Download Excel
        </Button>
      </FilterToolbarAction>
    </FilterToolbar>
  );
}
