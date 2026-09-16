"use client";
import { Input, Switch } from "@/components/primitives";

import { cn } from "@/lib/utils";
import { useDebouncedCallback } from "use-debounce";
import { useHubUserFilters } from "@/hooks/user-hub/use-hub-user-filters";
import { UserHubTab } from "@/types/user-hub";

const TAB_OPTIONS: { value: UserHubTab; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "students", label: "Students" },
];

export function UserHubFilterBar() {
  const filters = useHubUserFilters();
  const { state } = filters;

  const setQDebounced = useDebouncedCallback(filters.setQ, 150);

  return (
    <div className="space-y-3">
      <Input
        aria-label="Search users"
        placeholder="Search name, email, phone, emergency contact…"
        defaultValue={state.q}
        onChange={(e) => setQDebounced(e.target.value)}
        className="max-w-md"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="User type"
          className="bg-secondary rounded-xl inline-flex h-10 items-center justify-start"
        >
          {TAB_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={state.tab === value}
              className={cn(
                "inline-flex w-[120px] items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-normal text-[#717182] transition-all hover:text-[#454548] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                state.tab === value &&
                  "rounded-xl border-2 border-slate-300 bg-white text-black shadow-[0_0_10px_rgba(10,10,10,0.20)]",
              )}
              onClick={() => filters.setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="include-inactive-users"
              checked={state.includeInactive}
              onCheckedChange={filters.setIncludeInactive}
            />
            <label
              htmlFor="include-inactive-users"
              className="text-sm font-normal whitespace-nowrap"
            >
              Include inactive
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="incomplete-profiles"
              checked={state.incomplete}
              onCheckedChange={filters.setIncomplete}
            />
            <label
              htmlFor="incomplete-profiles"
              className="text-sm font-normal whitespace-nowrap"
            >
              Incomplete profiles
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
