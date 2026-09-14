"use client";

import { useDebouncedCallback } from "use-debounce";
import { Search } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import { Switch } from "@/components/primitives/switch";
import {
  ToolbarSegmentGroup,
  ToolbarSegmentToggle,
} from "@/components/shell/toolbar-segment-group";
import { useAdmissionsPeopleFilters } from "@/hooks/admissions/use-admissions-people-filters";
import type { AdmissionsPeopleTabCounts } from "@/hooks/admissions/use-admissions-people-tab-counts";
import type { UserHubTab } from "@/types/user-hub";

const TAB_OPTIONS: { value: UserHubTab; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "students", label: "Students" },
];

export function AdmissionsPeopleToolbar({
  tabCounts,
  isTabCountsLoading = false,
}: {
  tabCounts?: AdmissionsPeopleTabCounts;
  isTabCountsLoading?: boolean;
}) {
  const filters = useAdmissionsPeopleFilters();
  const { state } = filters;
  const setQDebounced = useDebouncedCallback(filters.setQ, 150);

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            width={15}
            height={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            aria-label="Search people"
            placeholder="Search name, email, phone…"
            defaultValue={state.q}
            onChange={(e) => setQDebounced(e.target.value)}
            className="h-8 w-52 pl-8 text-sm sm:w-64"
          />
        </div>

        {state.tab === "students" ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <Switch
              checked={state.includeAlumni}
              onCheckedChange={filters.setIncludeAlumni}
              aria-label="Include alumni"
            />
            <span className="hidden whitespace-nowrap sm:inline">
              Include alumni
            </span>
          </label>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
            <Switch
              checked={state.includeInactive}
              onCheckedChange={filters.setIncludeInactive}
              aria-label="Include inactive people"
            />
            <span className="hidden whitespace-nowrap sm:inline">
              Include inactive
            </span>
          </label>
        )}
      </div>

      <ToolbarSegmentGroup role="tablist" aria-label="Person type">
        {TAB_OPTIONS.map(({ value, label }) => {
          const count = tabCounts?.[value];
          const tabCount =
            isTabCountsLoading ? "…" : count !== undefined ? count : undefined;
          const ariaLabel =
            count !== undefined && !isTabCountsLoading
              ? `${label}, ${count} people`
              : label;

          return (
            <ToolbarSegmentToggle
              key={value}
              role="tab"
              aria-selected={state.tab === value}
              aria-label={ariaLabel}
              active={state.tab === value}
              count={tabCount}
              className="min-w-[5.5rem]"
              onClick={() => filters.setTab(value)}
            >
              {label}
            </ToolbarSegmentToggle>
          );
        })}
      </ToolbarSegmentGroup>
    </div>
  );
}
