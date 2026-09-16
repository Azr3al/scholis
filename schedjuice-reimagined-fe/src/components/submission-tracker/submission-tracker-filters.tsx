"use client";
import { Select, Switch } from "@/components/primitives";

import { FilterToolbar, FilterToolbarField } from "@/components/filters/filter-toolbar";
import { DateRangePresetDropdown } from "@/components/form/date-range-filter";
import EntityCombobox from "@/components/form/entity-combobox";
import { formatDate } from "@/helpers/date";
import {
  isDateRangePreset,
  type DateRangePreset,
} from "@/helpers/date-range-presets";
import { listToApiArray } from "@/helpers/filter-params";
import { formatUserComboboxSearchText } from "@/lib/users/user-combobox-search";
import {
  SUBMISSION_TRACKER_DATE_PRESETS,
  SUBMISSION_TRACKER_MIN_MISSED_DEFAULT,
} from "@/helpers/submission-tracker";
import { operatorEnum } from "@/types/api";
import { SubmissionTrackerSort } from "@/types/submission-tracker";
import { role } from "@/types/user";

type Props = {
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
  activeCoursesOnly: boolean;
  onActiveCoursesOnlyChange: (value: boolean) => void;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
  sort: string;
  onSortChange: (value: string) => void;
  onPageReset: () => void;
};

export function SubmissionTrackerFilters({
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
  activeCoursesOnly,
  onActiveCoursesOnlyChange,
  showAll,
  onShowAllChange,
  sort,
  onSortChange,
  onPageReset,
}: Props) {
  return (
    <div className="space-y-2">
      <FilterToolbar>
        <DateRangePresetDropdown
          layout="toolbar"
          className="min-w-[200px]"
          label="Date range"
          selectId="submission-tracker-date-preset"
          presetIds={SUBMISSION_TRACKER_DATE_PRESETS}
          preset={isDateRangePreset(datePreset) ? datePreset : "last30d"}
          onPresetChange={(p) => {
            onDatePresetChange(p);
            onPageReset();
          }}
          customFrom={dateFrom}
          customTo={dateTo}
          onCustomFromChange={(v) => {
            onDateFromChange(v ?? "");
            onPageReset();
          }}
          onCustomToChange={(v) => {
            onDateToChange(v ?? "");
            onPageReset();
          }}
          fromInputId="submission-tracker-date-from"
          toInputId="submission-tracker-date-to"
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
          filterParams={{
            filter_params: [
              {
                operator: operatorEnum.exact,
                field_name: "roles",
                value: listToApiArray([role.student]),
              },
            ],
          }}
          allowDeselect
        />
        <FilterToolbarField label="Sort by" width="md">
          <Select
            value={sort}
            onValueChange={(v) => {
              onSortChange(String(v ?? "") as typeof sort);
              onPageReset();
            }}
            items={[
              {
                value: SubmissionTrackerSort.MissedCountDesc,
                label: "Most missed first",
              },
              {
                value: SubmissionTrackerSort.MissedCountAsc,
                label: "Fewest missed first",
              },
              {
                value: SubmissionTrackerSort.StudentName,
                label: "Student name",
              },
              {
                value: SubmissionTrackerSort.CourseTitle,
                label: "Course name",
              },
            ]}
          />
        </FilterToolbarField>
        <div className="flex items-center gap-2 self-end pb-2">
          <Switch
            id="submission-tracker-active-courses"
            checked={activeCoursesOnly}
            onCheckedChange={(v) => {
              onActiveCoursesOnlyChange(v);
              onPageReset();
            }}
          />
          <label htmlFor="submission-tracker-active-courses" className="text-sm">
            Active courses only
          </label>
        </div>
        <div className="flex items-center gap-2 self-end pb-2">
          <Switch
            id="submission-tracker-show-all"
            checked={showAll}
            onCheckedChange={(v) => {
              onShowAllChange(v);
              onPageReset();
            }}
          />
          <label htmlFor="submission-tracker-show-all" className="text-sm">
            Show all students (not just {SUBMISSION_TRACKER_MIN_MISSED_DEFAULT}+ missed)
          </label>
        </div>
      </FilterToolbar>
      {resolvedRange ? (
        <p className="text-sm text-text-muted">
          Showing deadlines from {formatDate(resolvedRange.start)} to{" "}
          {formatDate(resolvedRange.end)}
        </p>
      ) : null}
      <p className="text-sm text-text-muted">
        Quizzes without a closing date are not counted as missed.
      </p>
    </div>
  );
}
