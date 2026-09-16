"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Settings } from "iconoir-react";
import { Button, buttonVariants, Skeleton } from "@/components/primitives";
import { ToggleGroup, ToggleGroupItem } from "@/components/misc/toggle-group";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { groupByColumnId } from "@/lib/kanban-board";
import { permissionsFor } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { useIssues, useIssueStatuses, useMoveIssue } from "@/hooks/issues/use-issues-board";
import { IssueSource, issueStatusId, type Issue, type IssueStatus } from "@/types/issue";
import { cn } from "@/lib/utils";
import { IssueCardContent } from "./issue-card";
import { NewIssueDialog } from "./new-issue-dialog";
import { IssueDetailDrawer } from "./issue-detail-drawer";

type IssueSourceFilter = "all" | IssueSource;

function IssuesKanbanSkeleton() {
  return (
    <div
      className="flex gap-3 overflow-x-auto pb-4"
      aria-busy="true"
      aria-label="Loading issues board"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex w-72 shrink-0 flex-col">
          <Skeleton className="mb-2 h-5 w-28" />
          <div className="space-y-2 rounded-2xl bg-surface-hover p-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function IssuesView() {
  const searchParams = useSearchParams();
  const deepLinkIssueId = useMemo(() => {
    const raw = searchParams.get("issue");
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  }, [searchParams]);

  const { user, isLoading: userLoading } = useUser(false);
  const canConfigure = user ? permissionsFor(user).can("issue.configure") : false;
  const [sourceFilter, setSourceFilter] = useState<IssueSourceFilter>("all");
  const statusesQuery = useIssueStatuses();
  const listSource =
    deepLinkIssueId != null
      ? undefined
      : sourceFilter === "all"
        ? undefined
        : sourceFilter;
  const issuesQuery = useIssues(listSource);
  const statuses = statusesQuery.data ?? [];
  const issues = issuesQuery.data ?? [];
  const move = useMoveIssue();

  const boardLoading =
    userLoading || statusesQuery.isLoading || issuesQuery.isLoading;
  const boardError = statusesQuery.isError || issuesQuery.isError;

  const [newOpen, setNewOpen] = useState(false);
  const [openIssue, setOpenIssue] = useState<Issue | null>(null);

  useEffect(() => {
    if (deepLinkIssueId == null || boardLoading) return;
    const match = issues.find((issue) => issue.id === deepLinkIssueId);
    if (match) setOpenIssue(match);
  }, [deepLinkIssueId, issues, boardLoading]);

  const itemsByColumn = useMemo(
    () => groupByColumnId(statuses, issues, issueStatusId),
    [statuses, issues],
  );

  const statusById = useMemo(() => {
    const map: Record<number, IssueStatus> = {};
    for (const status of statuses) map[status.id] = status;
    return map;
  }, [statuses]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl text-text-primary">Issues</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={sourceFilter}
            onValueChange={(value) => {
              if (
                value === "all" ||
                value === IssueSource.ParentComplaint ||
                value === IssueSource.Internal
              ) {
                setSourceFilter(value);
              }
            }}
            variant="secondary"
            size="sm"
          >
            <ToggleGroupItem value="all" aria-label="All issues">
              All
            </ToggleGroupItem>
            <ToggleGroupItem
              value={IssueSource.ParentComplaint}
              aria-label="Parent complaints"
            >
              Parent complaints
            </ToggleGroupItem>
            <ToggleGroupItem value={IssueSource.Internal} aria-label="Internal issues">
              Internal
            </ToggleGroupItem>
          </ToggleGroup>
          {canConfigure && (
            <Link
              href="/crm/issues/settings"
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "inline-flex items-center",
              )}
            >
              <Settings className="mr-1.5 h-4 w-4" />
              Configure
            </Link>
          )}
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Issue
          </Button>
        </div>
      </div>

      {boardLoading ? (
        <IssuesKanbanSkeleton />
      ) : boardError ? (
        <div className="rounded-lg border border-border bg-surface-elevated p-6 text-sm">
          <p className="text-text-primary">Could not load the issues board.</p>
          <p className="mt-1 text-text-secondary">
            Check your connection, then try again.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => {
              void statusesQuery.refetch();
              void issuesQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <KanbanBoard
          columns={statuses}
          itemsByColumn={itemsByColumn}
          getItemId={(issue) => issue.id}
          renderCard={(issue, { overlay }) => (
            <IssueCardContent issue={issue} overlay={overlay} />
          )}
          onOpenItem={setOpenIssue}
          onMoveItem={(issue, column) => {
            const status = statusById[column.id];
            if (status) move.mutate({ issueId: issue.id, statusId: status.id });
          }}
        />
      )}

      <NewIssueDialog open={newOpen} onOpenChange={setNewOpen} />

      <IssueDetailDrawer
        open={openIssue !== null}
        issue={openIssue}
        statuses={statuses}
        onClose={() => setOpenIssue(null)}
      />
    </div>
  );
}
