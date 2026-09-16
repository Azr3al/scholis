"use client";
import { Button } from "@/components/primitives";

import { useMemo } from "react";
import { isStudent } from "@/helpers/authorization";
import { useHubCourses } from "@/hooks/academic-hub/use-hub-courses";
import { useUser } from "@/hooks/useUser";
import { useAcademicHubContext } from "./academic-hub-context";
import { CourseGrid } from "./course-grid";
import { AcademicHubEmptyState } from "./empty-state";

export function AcademicHubPageInner() {
  const {
    filters,
    queryState,
    queryReady,
    userId,
    selectedProgram,
    setJoinCodeDialogOpen,
  } = useAcademicHubContext();
  const { user } = useUser();
  const { state, setQ, setStatus, setPage } = filters;

  const list = useHubCourses({
    state: queryState ?? state,
    userId,
    program: selectedProgram,
    enabled: queryReady && Boolean(userId),
  });

  const statusCounts = list.data?.statusCounts;

  const totalAcrossStatuses = useMemo(() => {
    if (!statusCounts) return 0;
    return (
      statusCounts.active +
      statusCounts.planned +
      statusCounts.ended +
      statusCounts.paused
    );
  }, [statusCounts]);

  const isListPending = !queryReady || list.isLoading;
  const isListRefetching =
    queryReady && list.isFetching && list.isPreviousData;
  const isEmpty = queryReady && !isListPending && (list.data?.rows.length ?? 0) === 0;
  const viewerIsStudent = isStudent(user);

  return (
    <div className="space-y-4 px-4 pb-20 pt-4 sm:px-6 lg:px-8">
      {isEmpty && state.q ? (
        <AcademicHubEmptyState
          variant={{ kind: "no-search-results", q: state.q }}
          onClearSearch={() => setQ("")}
        />
      ) : isEmpty && totalAcrossStatuses === 0 ? (
        <AcademicHubEmptyState
          variant={{
            kind: "no-courses-yet",
            programName: selectedProgram?.name,
          }}
          isStudent={viewerIsStudent}
          onJoinClass={() => setJoinCodeDialogOpen(true)}
        />
      ) : isEmpty && statusCounts ? (
        <AcademicHubEmptyState
          variant={{
            kind: "no-results-status",
            programName: selectedProgram?.name,
            counts: statusCounts,
          }}
          onBroadenStatus={(s) =>
            setStatus(
              state.status.includes(s) ? state.status : [...state.status, s],
            )
          }
        />
      ) : (
        <div aria-busy={isListPending || undefined}>
          <CourseGrid
            rows={list.data?.rows ?? []}
            selectedStatuses={state.status}
            isLoading={isListPending}
            isRefetching={isListRefetching}
          />
          {(list.data?.pageCount ?? 1) > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button
                variant="secondary" size="sm"
                disabled={isListPending || state.page <= 1}
                onClick={() => setPage(state.page - 1)}
              >
                Previous
              </Button>
              <span className="self-center text-sm text-muted-foreground">
                Page {state.page} of {list.data?.pageCount ?? 1}
              </span>
              <Button
                variant="secondary" size="sm"
                disabled={
                  isListPending || state.page >= (list.data?.pageCount ?? 1)
                }
                onClick={() => setPage(state.page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
