"use client";

import { Suspense, useCallback, useMemo } from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import { Button, Skeleton } from "@/components/primitives";
import { EmptyCopy, EmptyState } from "@/components/primitives/empty";
import { PageContainer } from "@/components/layout/page-container";
import { Table, column, type Column } from "@/components/data-table";
import { usePageHeader } from "@/components/shell/use-page-header";
import { AdmissionsPeopleToolbar } from "./admissions-people-toolbar";
import { PersonAttendingPanel } from "./person-attending-panel";
import { useAdmissionsPeopleFilters } from "@/hooks/admissions/use-admissions-people-filters";
import { useAdmissionsPeopleTabCounts } from "@/hooks/admissions/use-admissions-people-tab-counts";
import {
  useAdmissionsPeople,
  type AdmissionsPersonRow,
} from "@/hooks/admissions/use-admissions-people";
import { cn } from "@/lib/utils";

function headerLabel(label: string) {
  return (
    <span className="text-xs tracking-wider [font-variant:small-caps]">
      {label}
    </span>
  );
}

function AdmissionsPeoplePageInner() {
  const filters = useAdmissionsPeopleFilters();
  const { state } = filters;
  const list = useAdmissionsPeople({ state });
  const tabCountsQuery = useAdmissionsPeopleTabCounts();
  const [personId, setPersonId] = useQueryState("person", parseAsInteger);

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">People</h1>
      ),
      toolbar: (
        <AdmissionsPeopleToolbar
          tabCounts={tabCountsQuery.data}
          isTabCountsLoading={
            tabCountsQuery.isLoading && !tabCountsQuery.data
          }
        />
      ),
    }),
    [tabCountsQuery.data, tabCountsQuery.isLoading],
  );
  usePageHeader(headerConfig);

  const onNotFound = useCallback(() => {
    void setPersonId(null);
  }, [setPersonId]);

  const columns: Column<AdmissionsPersonRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: headerLabel("Name"),
        accessor: (row) => row.name,
        sizing: { role: "person" },
        enableSorting: false,
        cell: ({ row }) => {
          const alt = row.alternative_name?.trim() ?? "";
          const showAlt = alt !== "" && alt !== row.name;
          return (
            <button
              type="button"
              aria-pressed={personId === row.id}
              onClick={() => void setPersonId(row.id)}
              className={cn(
                "text-left font-medium text-text-primary",
                personId === row.id && "underline",
              )}
            >
              <span className="block">{row.name}</span>
              {showAlt ? (
                <span className="block text-sm font-normal text-text-muted">
                  {alt}
                </span>
              ) : null}
            </button>
          );
        },
      },
      column.text({
        id: "email",
        header: headerLabel("Email"),
        accessor: (row) => row.email,
        sizing: { role: "identifier" },
        enableSorting: false,
      }),
      column.text({
        id: "phone",
        header: headerLabel("Phone"),
        accessor: (row) => row.phone_number,
        sizing: { role: "identifier" },
        enableSorting: false,
      }),
      column.status({
        id: "status",
        header: headerLabel("Status"),
        accessor: (row) => (row.is_active ? "Active" : "Inactive"),
        sizing: { role: "status" },
      }),
    ],
    [personId, setPersonId],
  );

  const isListPending = list.isLoading || list.isFetching;
  const isEmpty = !isListPending && (list.data?.rows.length ?? 0) === 0;

  return (
    <PageContainer width="full" className="space-y-4 pb-20 pt-4">
      {isEmpty && state.q ? (
        <EmptyState>
          <EmptyCopy
            enBefore="No people "
            enHighlight="match"
            enAfter=""
            myBefore=""
            myHighlight="မတွေ့"
            myAfter="ပါ"
          />
        </EmptyState>
      ) : isEmpty ? (
        <EmptyState>
          <EmptyCopy
            enBefore="No "
            enHighlight="people"
            enAfter=""
            myBefore="လူ "
            myHighlight="မရှိ"
            myAfter="ပါ"
          />
        </EmptyState>
      ) : (
        <div
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]"
          aria-busy={isListPending || undefined}
        >
          <div>
            <Table
              columns={columns}
              rows={list.data?.rows ?? []}
              getRowId={(row) => String(row.id)}
              bodyMinHeightClassName="min-h-[12rem]"
            />
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
          <aside className="min-w-0 rounded-md border border-border-subtle p-4">
            <PersonAttendingPanel
              personId={personId}
              onNotFound={onNotFound}
            />
          </aside>
        </div>
      )}
    </PageContainer>
  );
}

export function AdmissionsPeoplePage() {
  return (
    <Suspense
      fallback={
        <PageContainer width="full" className="space-y-4 pb-20 pt-4" aria-busy="true">
          <Skeleton className="h-8 w-full max-w-sm" />
        </PageContainer>
      }
    >
      <AdmissionsPeoplePageInner />
    </Suspense>
  );
}
