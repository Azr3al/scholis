"use client";

import { Spinner } from "@/components/primitives/spinner";
import { makePostRequest } from "@/app/client-api/utils";
import { DuplicateClustersTable } from "@/components/user-insights/duplicate-clusters-table";
import { UserInsightsTabs } from "@/components/user-insights/user-insights-tabs";
import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import { queryParamDefault } from "@/config/defaults";
import {
  canFixOverlappingSessions,
  hasSchoolWideCourseAccess,
} from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import type {
  DuplicateSearchResponse,
  MsSignInActivityResponse,
} from "@/types/user-insights";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  useQueryState,
} from "nuqs";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Input } from "@/components/primitives";

const UserInsightsPageInner = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: userLoading } = useUser();
  const { tenant } = useTenant();
  const allowed = user ? hasSchoolWideCourseAccess(user) : false;
  const canMerge = user ? canFixOverlappingSessions(user) : false;

  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [includeInactive, setIncludeInactive] = useQueryState(
    "include_inactive",
    parseAsBoolean.withDefault(false),
  );

  useEffect(() => {
    if (!userLoading && user && !allowed) {
      router.replace("/home");
    }
  }, [allowed, router, user, userLoading]);

  const searchBody = useMemo(
    () => ({
      ...(search.trim() ? { q: search.trim() } : {}),
      include_inactive: includeInactive,
      page,
      size: 25,
    }),
    [includeInactive, page, search],
  );

  const duplicateQuery = useQuery({
    queryKey: ["userInsightsDuplicates", searchBody],
    enabled: allowed,
    keepPreviousData: true,
    queryFn: async () => {
      const res = await makePostRequest(
        "users/insights/duplicates/search",
        searchBody,
        { ...queryParamDefault, page, size: 25 },
      );
      return res.data as DuplicateSearchResponse;
    },
  });

  const userIds = useMemo(
    () =>
      duplicateQuery.data?.data.results.flatMap((c) =>
        c.users.map((u) => u.id),
      ) ?? [],
    [duplicateQuery.data],
  );

  const signInQuery = useQuery({
    queryKey: ["msSignInActivity", userIds],
    enabled: allowed && userIds.length > 0 && Boolean(tenant?.is_microsoft_on),
    queryFn: async () => {
      const res = await makePostRequest("users/microsoft-sign-in-activity", {
        user_ids: userIds,
      });
      return res.data as MsSignInActivityResponse;
    },
  });

  const isInitialLoading = duplicateQuery.isLoading && !duplicateQuery.data;
  const isRefetching = duplicateQuery.isFetching && !isInitialLoading;
  const summary = duplicateQuery.data?.data.summary;
  const rows = duplicateQuery.data?.data.results ?? [];
  const totalCount = duplicateQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));
  const signInByUserId = signInQuery.data?.data ?? {};


  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">User insights</h1>
        ),
      }),
      [],
    ),
  );
  if (userLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" />
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <PageContainer width="default" className="space-y-6">
      <Link
        href="/shortcuts"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"
      >
        <NavArrowLeft className="h-4 w-4" />
        Back to Shortcuts
      </Link>

      <div className="space-y-2">
        <p className="max-w-3xl text-sm text-text-muted">
          Review student account quality issues. Start with potential duplicate
          accounts flagged by shared contact information.
        </p>
      </div>

      <UserInsightsTabs />

      <p className="min-h-5 text-sm text-text-muted">
        {summary
          ? `${summary.cluster_count} clusters · ${summary.student_count} students · ${summary.sibling_flagged_count} possible sibling groups`
          : "\u00a0"}
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <Input
          value={search}
          onChange={(e) => {
            void setPage(1);
            void setSearch(e.target.value);
          }}
          placeholder="Search by name or email"
          className="max-w-md"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-inactive"
            checked={includeInactive}
            onCheckedChange={(checked) => {
              void setPage(1);
              void setIncludeInactive(checked === true);
            }}
          />
          <label htmlFor="include-inactive">Include inactive students</label>
        </div>
      </div>

      {duplicateQuery.isError ? (
        <p className="text-sm text-danger" role="alert">
          Failed to load duplicate clusters. Please try again.
        </p>
      ) : isInitialLoading ? (
        <TableSkeleton columns={4} rows={8} />
      ) : (
        <div
          className={cn(
            "transition-opacity",
            isRefetching && "pointer-events-none opacity-60",
          )}
        >
          <DuplicateClustersTable
            rows={rows}
            signInByUserId={signInByUserId}
            canMerge={canMerge}
            onMerged={() => {
              void queryClient.invalidateQueries({
                queryKey: ["userInsightsDuplicates"],
              });
            }}
          />
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-text-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => void setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => void setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
};

const UserInsightsPage = () => (
  <Suspense
    fallback={
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" />
      </div>
    }
  >
    <UserInsightsPageInner />
  </Suspense>
);

export default UserInsightsPage;
