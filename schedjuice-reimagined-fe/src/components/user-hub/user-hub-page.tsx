"use client";
import { Button, Skeleton } from "@/components/primitives";
import { PageContainer } from "@/components/layout/page-container";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { CardGridSkeleton } from "@/components/loading/structured-skeletons";
import { Can } from "@/components/auth/can";
import { useHubUserFilters } from "@/hooks/user-hub/use-hub-user-filters";
import { useHubUserTabCounts } from "@/hooks/user-hub/use-hub-user-tab-counts";
import { useHubUsers } from "@/hooks/user-hub/use-hub-users";
import { useTenant } from "@/hooks/useTenant";
import { usePermissions } from "@/hooks/usePermissions";
import { usePageHeader } from "@/components/shell/use-page-header";
import { UserHubToolbar } from "./user-hub-toolbar";
import { UserGrid } from "./user-grid";
import { UserList } from "./user-list";
import { UserHubEmptyState } from "./empty-state";

function UserHubPageInner() {
  const filters = useHubUserFilters();
  const { state } = filters;
  const list = useHubUsers({ state });
  const tabCountsQuery = useHubUserTabCounts();
  const { tenant } = useTenant();
  const { can } = usePermissions();

  const canCreateUser =
    can("user.create") ||
    (can("course.create") && Boolean(tenant?.can_teacher_create_course));
  const showCompletionActions = can("user.update");

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Users</h1>
      ),
      actions: canCreateUser ? (
        <>
          <Can permission="user.import">
            <Link href="/imports">
              <Button variant="secondary" size="sm">
                Import Users
              </Button>
            </Link>
          </Can>
          <Link href="/users/create">
            <Button size="sm">Create</Button>
          </Link>
        </>
      ) : undefined,
      toolbar: (
        <UserHubToolbar
          tabCounts={tabCountsQuery.data}
          isTabCountsLoading={
            tabCountsQuery.isLoading && !tabCountsQuery.data
          }
        />
      ),
    }),
    [canCreateUser, tabCountsQuery.data, tabCountsQuery.isLoading],
  );
  usePageHeader(headerConfig);

  const isListPending = list.isLoading || list.isFetching;
  const isListRefetching = list.isFetching && list.isPreviousData;
  const isEmpty = !isListPending && (list.data?.rows.length ?? 0) === 0;

  return (
    <PageContainer width="full" className="space-y-4 pb-20 pt-4">
      {isEmpty && state.q ? (
        <UserHubEmptyState
          variant={{ kind: "no-search-results", q: state.q }}
          onClearSearch={() => filters.setQ("")}
        />
      ) : isEmpty ? (
        <UserHubEmptyState variant={{ kind: "no-users" }} />
      ) : (
        <div aria-busy={isListPending || undefined}>
          {state.view === "list" ? (
            <UserList
              rows={list.data?.rows ?? []}
              isLoading={list.isLoading}
              isRefetching={isListRefetching}
            />
          ) : (
            <UserGrid
              rows={list.data?.rows ?? []}
              isLoading={list.isLoading}
              isRefetching={isListRefetching}
              showCompletionActions={showCompletionActions}
            />
          )}
          {(list.data?.pageCount ?? 1) > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={isListPending || state.page <= 1}
                onClick={() => filters.setPage(state.page - 1)}
              >
                Previous
              </Button>
              <span className="self-center text-sm text-text-muted">
                Page {state.page} of {list.data?.pageCount ?? 1}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={
                  isListPending || state.page >= (list.data?.pageCount ?? 1)
                }
                onClick={() => filters.setPage(state.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}

export function UserHubPage() {
  return (
    <Suspense
      fallback={
        <PageContainer width="full" className="space-y-4 pb-20 pt-4" aria-busy="true">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-8 w-full max-w-sm" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-28" />
          </div>
          <CardGridSkeleton count={6} cardClassName="min-h-36" />
        </PageContainer>
      }
    >
      <UserHubPageInner />
    </Suspense>
  );
}
