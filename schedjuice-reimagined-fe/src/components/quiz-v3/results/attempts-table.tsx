"use client";

import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { Button, Switch, useToast } from "@/components/primitives";
import { formatDateTime } from "@/helpers/date";
import {
  attemptEligibleForBulkRelease,
  attemptEligibleForBulkWaive,
  essayStaffStatusForAttempt,
  essayStaffStatusLabel,
} from "@/helpers/quiz-attempt-grading-status";
import { formatQuizAttemptOverdue } from "@/helpers/formatters";
import {
  pickHighestScoreAttemptPerUser,
  pickLatestAttemptPerUser,
  type QuizAttemptListRow,
} from "@/helpers/quiz-attempts-filters";
import {
  isQuizAttemptInProgress,
  quizAttemptEarnedScoreDisplay,
} from "@/helpers/quiz-attempt-score";
import {
  useQuizV3BulkWaiveEssayMutation,
  useQuizV3ReleaseAttemptsMutation,
  useQuizV3UnreleaseResultMutation,
} from "@/hooks/use-quiz-v3-grading-mutations";
import { useQuizAttemptsList } from "@/sdk/hooks/quiz-attempts";
import type { QuizAttempt } from "@/sdk/_types/quiz-attempts";
import { NavArrowRight } from "iconoir-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useMemo, useState } from "react";

const attemptViewParser = parseAsStringEnum([
  "all",
  "latest",
  "highest",
]).withDefault("all");

type Props = {
  quizId: number;
  hasEssayQuestions?: boolean;
};

function QuizAttemptsEssayBulkBar({
  selected,
  quizId,
  onClear,
}: {
  selected: QuizAttemptListRow[];
  quizId: number;
  onClear: () => void;
}) {
  const toast = useToast();
  const releaseM = useQuizV3ReleaseAttemptsMutation(quizId);
  const waiveM = useQuizV3BulkWaiveEssayMutation(quizId);
  const unreleaseM = useQuizV3UnreleaseResultMutation(quizId);

  const releaseIds = selected
    .filter((r) => attemptEligibleForBulkRelease(true, r))
    .map((r) => r.id);
  const waiveIds = selected
    .filter((r) => attemptEligibleForBulkWaive(true, r))
    .map((r) => r.id);

  const releasedUserId =
    selected.length === 1 && selected[0]?.is_released
      ? selected[0]?.user?.id
      : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken/15 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
      <p className="text-sm text-text-muted">
        {selected.length > 0
          ? `${selected.length} selected`
          : "Select rows for bulk waive or release."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={waiveIds.length === 0 || waiveM.isPending}
          isLoading={waiveM.isPending}
          onClick={() => {
            void (async () => {
              try {
                const data = await waiveM.mutateAsync(waiveIds);
                toast.add({
                  description: `Acknowledged ${data?.waived_count ?? waiveIds.length} attempt(s).`,
                });
                onClear();
              } catch {
                toast.add({
                  description: "Bulk waive failed."});
              }
            })();
          }}
        >
          Waive essay (selected)
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={releaseIds.length === 0 || releaseM.isPending}
          isLoading={releaseM.isPending}
          onClick={() => {
            void (async () => {
              try {
                const data = await releaseM.mutateAsync(releaseIds);
                const nRel = data?.released?.length ?? 0;
                const nErr = data?.errors?.length ?? 0;
                toast.add({
                  description:
                    nErr > 0
                      ? `Released ${nRel}; ${nErr} could not be released (check grading or waiver).`
                      : `Released ${nRel} attempt(s).`,
                });
                onClear();
              } catch {
                toast.add({
                  description: "Release failed."});
              }
            })();
          }}
        >
          Release results (selected)
        </Button>
        {releasedUserId != null ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={unreleaseM.isPending}
            isLoading={unreleaseM.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  "Hide released results for this student until you release again?",
                )
              ) {
                return;
              }
              void (async () => {
                try {
                  await unreleaseM.mutateAsync(releasedUserId);
                  toast.add({ description: "Results hidden for that student." });
                  onClear();
                } catch {
                  toast.add({
                    description: "Unrelease failed."});
                }
              })();
            }}
          >
            Unrelease student
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function QuizAttemptsTable({
  quizId,
  hasEssayQuestions = false,
}: Props) {
  const pathname = usePathname();
  const [attemptView, setAttemptView] = useQueryState(
    "attemptsView",
    attemptViewParser,
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const tableState = useResourceTableState({
    namespace: `quiz-v3-attempts-${quizId}`,
    syncUrl: false,
    initial: { sorts: ["-submitted_at"], pageSize: 500 },
  });

  const list = useQuizAttemptsList({
    quizId,
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["user", "answers"],
  });

  const postProcessRows = useCallback(
    (rows: QuizAttemptListRow[]) => {
      if (attemptView === "latest") return pickLatestAttemptPerUser(rows);
      if (attemptView === "highest") return pickHighestScoreAttemptPerUser(rows);
      return rows;
    },
    [attemptView],
  );

  const displayList = useMemo(() => {
    const rows = postProcessRows(list.rows as QuizAttemptListRow[]);
    return {
      ...list,
      rows: rows as QuizAttempt[],
      total: rows.length,
    };
  }, [list, postProcessRows]);

  const selectedRows = useMemo(
    () =>
      (displayList.rows as QuizAttemptListRow[]).filter((r) =>
        selectedIds.has(r.id),
      ),
    [displayList.rows, selectedIds],
  );

  const toggleSelected = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const columns = useMemo((): Column<QuizAttempt>[] => {
    const cols: Column<QuizAttempt>[] = [];

    if (hasEssayQuestions) {
      cols.push({
        id: "__select",
        header: "",
        accessor: (row) => row.id,
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={selectedIds.has(row.id)}
            onChange={(e) => toggleSelected(row.id, e.target.checked)}
            aria-label={`Select attempt ${row.id}`}
          />
        ),
      });
    }

    cols.push(
      column.text<QuizAttempt>({
        id: "user",
        header: "Student",
        accessor: (row) => row.user?.name ?? "—",
      }),
      column.text<QuizAttempt>({
        id: "score",
        header: "Score",
        accessor: (row) =>
          isQuizAttemptInProgress(row)
            ? "—"
            : quizAttemptEarnedScoreDisplay(row),
      }),
      column.text<QuizAttempt>({
        id: "max_score",
        header: "Max",
        accessor: (row) =>
          isQuizAttemptInProgress(row) ? "—" : String(row.max_score ?? ""),
      }),
      column.text<QuizAttempt>({
        id: "submitted_at",
        header: "Submitted",
        accessor: (row) =>
          row.submitted_at ? formatDateTime(row.submitted_at) : "In progress",
      }),
      column.text<QuizAttempt>({
        id: "overdue_seconds",
        header: "Time limit",
        accessor: (row) =>
          isQuizAttemptInProgress(row)
            ? "—"
            : formatQuizAttemptOverdue(row.overdue_seconds ?? 0),
      }),
    );

    if (hasEssayQuestions) {
      cols.push(
        column.text<QuizAttempt>({
          id: "essay_status",
          header: "Essays",
          accessor: (row) =>
            essayStaffStatusLabel(
              essayStaffStatusForAttempt(true, row as QuizAttemptListRow),
            ),
        }),
        column.text<QuizAttempt>({
          id: "released",
          header: "Released",
          accessor: (row) => (row.is_released ? "Yes" : "No"),
        }),
        {
          id: "__open",
          header: "",
          accessor: () => null,
          cell: ({ row }) => {
            const href =
              typeof pathname === "string"
                ? `/quizzes-v3/${quizId}/attempts/${row.id}?ref=${encodeURIComponent(
                    `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`,
                  )}`
                : `/quizzes-v3/${quizId}/attempts/${row.id}`;
            return (
              <Link
                href={href}
                className="inline-flex size-8 items-center justify-center text-accent"
                title="Open attempt"
              >
                <NavArrowRight className="size-4" aria-hidden />
              </Link>
            );
          },
        },
      );
    }

    return cols;
  }, [hasEssayQuestions, pathname, quizId, selectedIds, toggleSelected]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken/20 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2">
          <Switch
            id={`quiz-attempts-latest-${quizId}`}
            checked={attemptView === "latest"}
            onCheckedChange={(c) => void setAttemptView(c ? "latest" : "all")}
          />
          <label
            htmlFor={`quiz-attempts-latest-${quizId}`}
            className="cursor-pointer text-sm font-normal leading-snug"
          >
            Most recent attempt per student
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={`quiz-attempts-highest-${quizId}`}
            checked={attemptView === "highest"}
            onCheckedChange={(c) => void setAttemptView(c ? "highest" : "all")}
          />
          <label
            htmlFor={`quiz-attempts-highest-${quizId}`}
            className="cursor-pointer text-sm font-normal leading-snug"
          >
            Highest score per student
          </label>
        </div>
      </div>

      {hasEssayQuestions ? (
        <QuizAttemptsEssayBulkBar
          quizId={quizId}
          selected={selectedRows}
          onClear={clearSelection}
        />
      ) : null}

      <ResourceTable
        list={displayList}
        tableState={tableState}
        columns={columns}
        getRowId={(row) => String(row.id)}
        rowHref={
          hasEssayQuestions
            ? undefined
            : (row) => `/quizzes-v3/${quizId}/attempts/${row.id}`
        }
      />
    </div>
  );
}
