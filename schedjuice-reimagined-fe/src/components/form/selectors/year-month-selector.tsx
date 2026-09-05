import { Select } from "@/components/primitives";
import MonthSelector from "./month-selector";
import YearSelector from "./year-selector";
import {
  filterToolbarFieldStackClassName,
  filterToolbarLabelClassName,
  type FilterFieldLayout,
} from "@/components/filters/filter-toolbar";
import {
  getDateISOString,
  getIsoWeeksOverlappingMonth,
  type MonthType,
} from "@/helpers/date";
import { useMemo } from "react";

const WHOLE_MONTH_VALUE = "all";

interface YearMonthSelectorProps {
  date?: Date;
  setDate: (date: Date) => void;
  label?: string;
  isRequired?: boolean;
  /** Year and month selects share the row width (e.g. inside bordered form sections). */
  fullWidth?: boolean;
  /** Single-row layout for compact toolbars (e.g. fullscreen sheet controls). */
  inline?: boolean;
  monthType?: MonthType | null;
  /** When true, show a week dropdown (Mon–Sun weeks overlapping the month). */
  showWeek?: boolean;
  /** Monday of the selected week, or `null` for the full month. */
  weekStartMonday?: Date | null;
  setWeekStartMonday?: (d: Date | null) => void;
  weekLabel?: string;
  layout?: FilterFieldLayout;
  /** Include years after the current calendar year (e.g. exam session dates). */
  yearsAhead?: number;
}

const YearMonthSelector: React.FC<YearMonthSelectorProps> = ({
  date,
  setDate,
  label,
  isRequired,
  fullWidth = false,
  inline = false,
  monthType,
  showWeek = false,
  weekStartMonday,
  setWeekStartMonday,
  weekLabel = "Week",
  layout = "form",
  yearsAhead = 0,
}) => {
  const isToolbar = layout === "toolbar";
  const monthAnchor = date ?? new Date();
  const weeksInMonth = useMemo(
    () => getIsoWeeksOverlappingMonth(monthAnchor),
    [monthAnchor],
  );

  const weekSelectValue =
    weekStartMonday != null
      ? getDateISOString(weekStartMonday)
      : WHOLE_MONTH_VALUE;

  const yearMonthPickers = (
    <>
      <YearSelector
        date={date}
        fullWidth={fullWidth}
        yearsAhead={yearsAhead}
        setDate={(newDate) => {
          setDate(
            date
              ? new Date(newDate.getFullYear(), date.getMonth(), 1)
              : new Date(newDate.getFullYear(), 1, 1),
          );
        }}
      />
      <MonthSelector
        date={date}
        fullWidth={fullWidth}
        setDate={(newDate) => {
          setDate(
            date
              ? new Date(date.getFullYear(), newDate.getMonth(), 1)
              : new Date(2000, newDate.getMonth(), 1),
          );
        }}
        monthType={monthType}
      />
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {label ? (
          <label className="shrink-0 text-sm font-medium">
            {label}
            {isRequired ? <span className="text-destructive"> *</span> : null}
          </label>
        ) : null}
        {yearMonthPickers}
      </div>
    );
  }

  if (isToolbar) {
    return (
      <div className={filterToolbarFieldStackClassName()}>
        {label ? (
          <label className={filterToolbarLabelClassName()}>
            {label}
            {isRequired ? <span className="text-destructive"> *</span> : null}
          </label>
        ) : null}
        <div className="flex h-10 flex-nowrap items-stretch gap-2.5">
          {yearMonthPickers}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2">
        {label ? (
          <label className="text-sm font-medium">
            {label}
            {isRequired ? <span className="text-destructive"> *</span> : null}
          </label>
        ) : null}
        <div
          className={
            fullWidth
              ? "grid grid-cols-2 gap-3"
              : "flex flex-wrap gap-2.5"
          }
        >
          {yearMonthPickers}
        </div>
      </div>
      {showWeek && setWeekStartMonday && weeksInMonth.length > 0 ? (
        <div className="flex w-full min-w-[12rem] flex-col gap-1.5 sm:w-56">
          <label className="text-xs">{weekLabel}</label>
          <Select
            value={weekSelectValue}
            onValueChange={(v) => {
              const next = String(v ?? "");
              if (next === WHOLE_MONTH_VALUE) setWeekStartMonday(null);
              else {
                const [y, m, d] = next.split("-").map(Number);
                setWeekStartMonday(new Date(y, m - 1, d, 12, 0, 0));
              }
            }}
            className="h-9 w-full"
            placeholder="Whole month"
            items={[
              { value: WHOLE_MONTH_VALUE, label: "Whole month" },
              ...weeksInMonth.map((w) => ({
                value: getDateISOString(w.monday),
                label: w.label,
              })),
            ]}
          />
        </div>
      ) : null}
    </div>
  );
};

export default YearMonthSelector;
