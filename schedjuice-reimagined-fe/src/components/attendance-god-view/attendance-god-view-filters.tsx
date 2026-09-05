"use client";
import { Checkbox, Input, Select } from "@/components/primitives";

import {
  FilterToolbar,
  FilterToolbarField,
} from "@/components/filters/filter-toolbar";
import { DateRangePresetDropdown } from "@/components/form/date-range-filter";
import EntityCombobox from "@/components/form/entity-combobox";
import MultiSelectPopOver from "@/components/form/multi-select-popover";
import { formatDate } from "@/helpers/date";
import {
  isDateRangePreset,
  resolveDateRange,
  type DateRangePreset,
} from "@/helpers/date-range-presets";
import { listToApiArray } from "@/helpers/filter-params";
import { formatUserComboboxSearchText } from "@/lib/users/user-combobox-search";
import { operatorEnum } from "@/types/api";
import type { AttendanceGodViewMode } from "@/types/attendance-god-view";
import { CourseMarkingProblemStatus } from "@/types/attendance-god-view";
import { COURSE_MARKING_PROBLEM_STATUS_OPTIONS } from "@/helpers/attendance-god-view";
import { role } from "@/types/user";

export type GodViewCategoryOption = { id: number; name: string };

const DAILY_DATE_PRESETS = ["today", "custom"] as const satisfies readonly DateRangePreset[];
const MONTHLY_DATE_PRESETS = ["month", "custom"] as const satisfies readonly DateRangePreset[];
const RISK_DATE_PRESETS = [
  "month",
  "last30d",
  "last3m",
  "week",
  "today",
  "custom",
] as const satisfies readonly DateRangePreset[];

type Props = {
  mode: AttendanceGodViewMode;
  datePreset: DateRangePreset;
  onDatePresetChange: (preset: DateRangePreset) => void;
  dateFrom: string | null;
  dateTo: string | null;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  resolvedRange: { start: string; end: string } | null;
  courseId: string;
  onCourseIdChange: (value: string) => void;
  studentId: string;
  onStudentIdChange: (value: string) => void;
  categoryEntities: GodViewCategoryOption[];
  selectedCategories: GodViewCategoryOption[];
  onSelectedCategoriesChange: (entities: GodViewCategoryOption[]) => void;
  categoriesAllSelected: boolean;
  programId: string;
  onProgramIdChange: (value: string) => void;
  minRate: string;
  onMinRateChange: (value: string) => void;
  maxRate: string;
  onMaxRateChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  problemStatus: CourseMarkingProblemStatus;
  onProblemStatusChange: (value: CourseMarkingProblemStatus) => void;
  gapMinRate: string;
  onGapMinRateChange: (value: string) => void;
  stalledAfterMarking: boolean;
  onStalledAfterMarkingChange: (value: boolean) => void;
  onPageReset: () => void;
};

export function AttendanceGodViewFilters({
  mode,
  datePreset,
  onDatePresetChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  resolvedRange,
  courseId,
  onCourseIdChange,
  studentId,
  onStudentIdChange,
  categoryEntities,
  selectedCategories,
  onSelectedCategoriesChange,
  categoriesAllSelected,
  programId,
  onProgramIdChange,
  minRate,
  onMinRateChange,
  maxRate,
  onMaxRateChange,
  sort,
  onSortChange,
  problemStatus,
  onProblemStatusChange,
  gapMinRate,
  onGapMinRateChange,
  stalledAfterMarking,
  onStalledAfterMarkingChange,
  onPageReset,
}: Props) {
  const presetIds =
    mode === "daily_absences" || mode === "course_marking_gaps"
      ? DAILY_DATE_PRESETS
      : mode === "monthly_students"
        ? MONTHLY_DATE_PRESETS
        : RISK_DATE_PRESETS;

  const dateLabel =
    mode === "daily_absences" || mode === "course_marking_gaps"
      ? "Date"
      : mode === "monthly_students"
        ? "Month"
        : "Date range";

  return (
    <div className="space-y-2">
      <FilterToolbar>
        <DateRangePresetDropdown
          layout="toolbar"
          className="min-w-[200px]"
          label={dateLabel}
          selectId="god-view-date-preset"
          presetIds={presetIds}
          preset={isDateRangePreset(datePreset) ? datePreset : presetIds[0]}
          onPresetChange={(p) => {
            onDatePresetChange(p);
            if (
              p === "custom" &&
              (mode === "daily_absences" || mode === "course_marking_gaps") &&
              (!dateFrom || !dateTo)
            ) {
              const seed = resolveDateRange("today", null, null);
              if (seed) {
                onDateFromChange(seed.start);
                onDateToChange(seed.end);
              }
            }
            if (
              p === "custom" &&
              mode === "monthly_students" &&
              (!dateFrom || !dateTo)
            ) {
              const seed = resolveDateRange("month", null, null);
              if (seed) {
                onDateFromChange(seed.start);
                onDateToChange(seed.end);
              }
            }
            onPageReset();
          }}
          customFrom={dateFrom}
          customTo={dateTo}
          onCustomFromChange={(v) => {
            const nextFrom = v ?? "";
            onDateFromChange(nextFrom);
            if (nextFrom && dateTo && nextFrom > dateTo) {
              onDateToChange(nextFrom);
            }
            onPageReset();
          }}
          onCustomToChange={(v) => {
            const nextTo = v ?? "";
            onDateToChange(nextTo);
            if (nextTo && dateFrom && nextTo < dateFrom) {
              onDateFromChange(nextTo);
            }
            onPageReset();
          }}
          fromInputId="god-view-date-from"
          toInputId="god-view-date-to"
        />
        <EntityCombobox
          entity="courses"
          label="Course"
          layout="toolbar"
          containerClassName="min-w-[200px]"
          value={courseId}
          onChange={(v) => {
            onCourseIdChange(v ?? "");
            onPageReset();
          }}
          comboboxPlaceholder="All courses"
          displayFunction={(c) => c.title}
          queryParams={{ fields: ["id", "title"], sorts: ["title"] }}
          allowDeselect
        />
        {(mode === "risk" || mode === "monthly_students") && (
          <EntityCombobox
            entity="users"
            label="Student"
            layout="toolbar"
            containerClassName="min-w-[200px]"
            value={studentId}
            onChange={(v) => {
              onStudentIdChange(v ?? "");
              onPageReset();
            }}
            comboboxPlaceholder="All students"
            displayFunction={(u) => u.name || u.email}
            searchFunction={formatUserComboboxSearchText}
            queryParams={{
              fields: ["id", "name", "email", "alternative_name"],
              sorts: ["name"],
            }}
            allowDeselect
            filterParams={{
              filter_params: [
                {
                  field_name: "roles",
                  operator: operatorEnum.contains,
                  value: listToApiArray([role.student]),
                },
              ],
            }}
          />
        )}
        {categoryEntities.length > 0 ? (
          <MultiSelectPopOver
            key={categoriesAllSelected ? "categories-all" : `categories-${selectedCategories.map((c) => c.id).join(",")}`}
            label="Categories"
            entities={categoryEntities}
            selectedEntities={selectedCategories}
            setSelectedEntities={(next) => {
              const value =
                typeof next === "function" ? next(selectedCategories) : next;
              onSelectedCategoriesChange(value as GodViewCategoryOption[]);
              onPageReset();
            }}
            displayFunction={(c) => c.name}
            isAllSelectedDefault={categoriesAllSelected}
          />
        ) : (
          <FilterToolbarField label="Categories" width="md">
            <span className="text-sm text-text-muted">Loading…</span>
          </FilterToolbarField>
        )}
        <EntityCombobox
          entity="programs"
          label="Program"
          layout="toolbar"
          containerClassName="min-w-[180px]"
          value={programId}
          onChange={(v) => {
            onProgramIdChange(v ?? "");
            onPageReset();
          }}
          comboboxPlaceholder="All"
          displayFunction={(p) => p.name}
          queryParams={{ fields: ["id", "name"], sorts: ["name"] }}
          allowDeselect
        />
        {mode === "course_marking_gaps" && (
          <FilterToolbarField label="Stalled after marking" width="md">
            <div className="flex h-9 items-center">
              <Checkbox
                checked={stalledAfterMarking}
                onCheckedChange={(c) => {
                  onStalledAfterMarkingChange(c === true);
                  onPageReset();
                }}
                aria-label="Stalled after marking"
              />
            </div>
          </FilterToolbarField>
        )}
        {mode === "course_marking_gaps" && !stalledAfterMarking && (
          <>
            <FilterToolbarField label="Problem type" width="lg">
              <Select
                value={problemStatus}
                onValueChange={(v) => {
                  onProblemStatusChange(v as CourseMarkingProblemStatus);
                  onPageReset();
                }}
                items={COURSE_MARKING_PROBLEM_STATUS_OPTIONS.map((option) => ({
                  value: String(option.value),
                  label: option.label,
                }))}
                className="w-[200px]"
              />
            </FilterToolbarField>
            <FilterToolbarField
              label="Min rate %"
              htmlFor="gapMinRate"
              width="sm"
            >
              <Input
                id="gapMinRate"
                type="number"
                min={0}
                max={100}
                placeholder="80"
                value={gapMinRate}
                onChange={(e) => {
                  onGapMinRateChange(e.target.value);
                  onPageReset();
                }}
                className="w-[100px]"
              />
            </FilterToolbarField>
          </>
        )}
        {mode === "risk" && (
          <>
            <FilterToolbarField label="Min rate %" htmlFor="minRate" width="sm">
              <Input
                id="minRate"
                type="number"
                min={0}
                max={100}
                value={minRate}
                onChange={(e) => {
                  onMinRateChange(e.target.value);
                  onPageReset();
                }}
                className="w-[100px]"
              />
            </FilterToolbarField>
            <FilterToolbarField label="Max rate %" htmlFor="maxRate" width="sm">
              <Input
                id="maxRate"
                type="number"
                min={0}
                max={100}
                value={maxRate}
                onChange={(e) => {
                  onMaxRateChange(e.target.value);
                  onPageReset();
                }}
                className="w-[100px]"
              />
            </FilterToolbarField>
            <FilterToolbarField label="Sort" width="lg">
              <Select
                value={sort}
                onValueChange={(v) => {
                  onSortChange(v);
                  onPageReset();
                }}
                items={[
                  {
                    value: "attendance_rate_asc",
                    label: "Lowest attendance first",
                  },
                  {
                    value: "attendance_rate_desc",
                    label: "Highest attendance first",
                  },
                  { value: "recent_risk", label: "Recent risk first" },
                  { value: "student_name", label: "Student name" },
                ]}
                className="w-[200px]"
              />
            </FilterToolbarField>
          </>
        )}
      </FilterToolbar>
      <p className="text-sm text-text-muted">
        {resolvedRange
          ? resolvedRange.start === resolvedRange.end
            ? formatDate(resolvedRange.start, "MMM d, yyyy")
            : `${formatDate(resolvedRange.start, "MMM d, yyyy")} - ${formatDate(resolvedRange.end, "MMM d, yyyy")}`
          : "Choose a valid date range to load data."}
      </p>
    </div>
  );
}
