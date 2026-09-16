"use client";

import { useDebouncedCallback } from "use-debounce";
import { List, Search, ViewGrid } from "iconoir-react";
import { Input } from "@/components/primitives/input";
import { Switch } from "@/components/primitives/switch";
import {
  ToolbarSegment,
  ToolbarSegmentGroup,
  ToolbarSegmentToggle,
} from "@/components/shell/toolbar-segment-group";
import { useHubUserFilters } from "@/hooks/user-hub/use-hub-user-filters";
import type { HubUserTabCounts } from "@/hooks/user-hub/use-hub-user-tab-counts";
import { UserHubTab, UserHubViewMode } from "@/types/user-hub";

const TAB_OPTIONS: { value: UserHubTab; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "students", label: "Students" },
];

const VIEW_OPTIONS: {
  value: UserHubViewMode;
  label: string;
  icon: typeof ViewGrid;
}[] = [
  { value: "grid", label: "Grid view", icon: ViewGrid },
  { value: "list", label: "List view", icon: List },
];

export function UserHubToolbar({
  tabCounts,
  isTabCountsLoading = false,
}: {
  tabCounts?: HubUserTabCounts;
  isTabCountsLoading?: boolean;
}) {
  const filters = useHubUserFilters();
  const { state } = filters;
  const setQDebounced = useDebouncedCallback(filters.setQ, 150);

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <ToolbarSegmentGroup role="tablist" aria-label="User type">
        {TAB_OPTIONS.map(({ value, label }) => {
          const count = tabCounts?.[value];
          const tabCount =
            isTabCountsLoading ? "…" : count !== undefined ? count : undefined;
          const ariaLabel =
            count !== undefined && !isTabCountsLoading
              ? `${label}, ${count} users`
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            width={15}
            height={15}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            aria-label="Search users"
            placeholder="Search name, email, phone…"
            defaultValue={state.q}
            onChange={(e) => setQDebounced(e.target.value)}
            className="h-8 w-52 pl-8 text-sm sm:w-64"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <Switch
            checked={state.includeInactive}
            onCheckedChange={filters.setIncludeInactive}
            aria-label="Include inactive users"
          />
          <span className="hidden whitespace-nowrap sm:inline">
            Include inactive
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <Switch
            checked={state.incomplete}
            onCheckedChange={filters.setIncomplete}
            aria-label="Incomplete profiles only"
          />
          <span className="hidden whitespace-nowrap sm:inline">Incomplete</span>
        </label>

        <ToolbarSegmentGroup aria-label="View mode">
          {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => (
            <ToolbarSegment
              key={value}
              icon
              aria-label={label}
              aria-pressed={state.view === value}
              active={state.view === value}
              onClick={() => filters.setView(value)}
            >
              <Icon width={16} height={16} aria-hidden />
            </ToolbarSegment>
          ))}
        </ToolbarSegmentGroup>
      </div>
    </div>
  );
}
