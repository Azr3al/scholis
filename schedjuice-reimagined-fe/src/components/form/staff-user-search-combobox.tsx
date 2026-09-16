"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { searchEntities } from "@/app/client-api/utils";
import { Checkbox } from "@/components/primitives/checkbox";
import { Skeleton } from "@/components/primitives/skeleton";
import {
  AsyncContentPanel,
  AsyncContentPanelRow,
  deriveAsyncPanelState,
} from "@/components/loading/async-content-panel";
import { SearchField } from "@/components/form/search-field";
import { formatStaffUserSecondaryLine } from "@/lib/users/staff-user-search-display";
import { cn } from "@/lib/utils";
import type { filterParam } from "@/types/api";
import type { accountType } from "@/types/user";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;

type StaffUserSearchComboboxProps = {
  enabled: boolean;
  disabled?: boolean;
  filterParams: filterParam[];
  selected: Record<number, accountType>;
  onToggleUser: (user: accountType) => void;
  isUserDisabled?: (user: accountType) => boolean;
  renderUserMeta?: (user: accountType) => React.ReactNode;
  placeholder?: string;
  disabledPlaceholder?: string;
  queryKeyPrefix?: string;
  queryScopeKey?: string;
};

function StaffUserSearchRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm motion-reduce:animate-none" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-3/5 motion-reduce:animate-none" />
            <div className="flex flex-wrap gap-1">
              <Skeleton className="h-5 w-14 rounded-full motion-reduce:animate-none" />
              <Skeleton className="h-5 w-16 rounded-full motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StaffUserSearchCombobox({
  enabled,
  disabled = false,
  filterParams,
  selected,
  onToggleUser,
  isUserDisabled,
  renderUserMeta,
  placeholder = "Search staff by name, alt name, or email",
  disabledPlaceholder = "Select a role first",
  queryKeyPrefix = "staff-user-search",
  queryScopeKey = "",
}: StaffUserSearchComboboxProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const staffSearch = useQuery({
    queryKey: [
      queryKeyPrefix,
      queryScopeKey,
      debouncedSearch,
      JSON.stringify(filterParams),
    ],
    enabled: enabled && debouncedSearch.length >= MIN_SEARCH_LENGTH,
    queryFn: async () => {
      const response = await searchEntities(
        "users",
        {
          q: debouncedSearch,
          size: 50,
          fields: ["id", "name", "email", "alternative_name", "roles"],
          sorts: ["name"],
        },
        { filter_params: filterParams },
      );
      return (response.data?.data ?? []) as accountType[];
    },
  });

  const users = staffSearch.data ?? [];
  const isFetching = staffSearch.isFetching;

  const panelState = useMemo(
    () =>
      deriveAsyncPanelState({
        enabled,
        queryLength: debouncedSearch.length,
        minLength: MIN_SEARCH_LENGTH,
        isError: staffSearch.isError,
        isFetching,
        resultCount: users.length,
      }),
    [debouncedSearch.length, enabled, isFetching, staffSearch.isError, users.length],
  );

  const inputDisabled = disabled || !enabled;

  return (
    <div className="space-y-2">
      <SearchField
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        disabled={inputDisabled}
        isFetching={enabled && isFetching}
        placeholder={enabled ? placeholder : disabledPlaceholder}
        ariaLabel={enabled ? placeholder : disabledPlaceholder}
      />

      <AsyncContentPanel
        state={panelState}
        ariaBusy={isFetching}
        stableHeight="inline"
        idle="Choose a role to start searching for staff."
        hint="Type at least 2 characters to search."
        error="Couldn't load results."
        empty="No staff found."
        loading={<StaffUserSearchRowsSkeleton rows={5} />}
        staggerResults
      >
        <div className="divide-y divide-border/60">
          {users.map((user) => {
            const rowDisabled = isUserDisabled?.(user) ?? false;
            const isSelected = Boolean(selected[user.id]);
            const secondaryLine = formatStaffUserSecondaryLine(user);

            return (
              <AsyncContentPanelRow key={user.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-4 py-3",
                    rowDisabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={rowDisabled}
                    onCheckedChange={() => onToggleUser(user)}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {user.name}
                    </span>
                    {secondaryLine ? (
                      <span className="truncate text-xs text-text-muted">
                        {secondaryLine}
                      </span>
                    ) : null}
                    {renderUserMeta ? renderUserMeta(user) : null}
                  </span>
                </label>
              </AsyncContentPanelRow>
            );
          })}
        </div>
      </AsyncContentPanel>
    </div>
  );
}
