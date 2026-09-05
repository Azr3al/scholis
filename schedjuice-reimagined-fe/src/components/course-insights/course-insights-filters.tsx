"use client";
import { Spinner } from "@/components/primitives/spinner";
import { Input } from "@/components/primitives";

import EntitySelect from "@/components/form/entity-select";
import { FilterToolbar, FilterToolbarField } from "@/components/filters/filter-toolbar";
import { cn } from "@/lib/utils";
import {
  COURSE_INSIGHTS_ISSUE_BADGE_CLASS,
  COURSE_INSIGHTS_ISSUE_LABELS,
} from "@/helpers/course-insights";
import {
  COURSE_INSIGHTS_ISSUES,
  type CourseInsightsIssue,
  type CourseInsightsSummary,
} from "@/types/course-insights";

type CourseInsightsFiltersProps = {
  summary: CourseInsightsSummary | undefined;
  selectedIssues: CourseInsightsIssue[];
  onToggleIssue: (issue: CourseInsightsIssue) => void;
  search: string;
  onSearchChange: (value: string) => void;
  categoryId: string;
  onCategoryIdChange: (value: string) => void;
  isRefetching: boolean;
};

export function CourseInsightsFilters({
  summary,
  selectedIssues,
  onToggleIssue,
  search,
  onSearchChange,
  categoryId,
  onCategoryIdChange,
  isRefetching,
}: CourseInsightsFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {COURSE_INSIGHTS_ISSUES.map((issue) => {
          const active = selectedIssues.includes(issue);
          const count = summary?.issue_counts[issue] ?? 0;
          return (
            <button
              key={issue}
              type="button"
              onClick={() => onToggleIssue(issue)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent/50",
              )}
            >
              <span>{COURSE_INSIGHTS_ISSUE_LABELS[issue]}</span>
              <span className="font-mono tabular-nums text-xs">{count}</span>
            </button>
          );
        })}
        {isRefetching ? (
          <Spinner
 className="h-4 w-4 shrink-0 text-muted-foreground"
 aria-label="Refreshing results"
 />
        ) : null}
      </div>
      <FilterToolbar className="gap-4">
        <EntitySelect
          entity="categories"
          label="Category"
          layout="toolbar"
          containerClassName="min-w-[180px]"
          value={categoryId ? Number(categoryId) : 0}
          onChange={(v) => onCategoryIdChange(v > 0 ? String(v) : "")}
          emptyOption={{ value: "", label: "All" }}
          placeholder="All"
          displayFunction={(c) => c.name}
          queryParams={{ fields: ["id", "name"], sorts: ["name"] }}
        />
        <FilterToolbarField label="Search" width="auto" className="max-w-md flex-1">
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by course title or code"
            className="w-full max-w-md"
          />
        </FilterToolbarField>
      </FilterToolbar>
    </div>
  );
}

export function CourseInsightsIssueBadge({
  issue,
}: {
  issue: CourseInsightsIssue;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        COURSE_INSIGHTS_ISSUE_BADGE_CLASS[issue],
      )}
    >
      {COURSE_INSIGHTS_ISSUE_LABELS[issue]}
    </span>
  );
}
