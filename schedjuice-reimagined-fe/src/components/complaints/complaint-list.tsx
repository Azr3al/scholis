"use client";

import Link from "next/link";
import { Skeleton } from "@/components/primitives";
import { EmptyState } from "@/components/primitives/empty";
import { buttonVariants } from "@/components/primitives";
import { formatRelativeTime } from "@/helpers/date";
import { useComplaints } from "@/hooks/complaints/use-complaints";
import {
  isComplaintClosed,
  resolveIssueStatus,
} from "@/lib/complaints/complaint-status";
import { cn } from "@/lib/utils";
import type { Issue } from "@/types/issue";
import { Plus } from "iconoir-react";

function ComplaintRow({ issue }: { issue: Issue }) {
  const status = resolveIssueStatus(issue);
  const preview = issue.description?.trim() || "No message preview";
  const updatedAt = issue.updated_at ?? issue.created_at;

  return (
    <Link
      href={`/complaints/${issue.id}`}
      className="block rounded-xl border border-border bg-surface-elevated p-4 shadow-sm transition-colors hover:border-border-strong hover:bg-surface"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text-primary">{issue.title}</div>
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{preview}</p>
        </div>
        {status ? (
          <span
            className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
            style={{
              borderColor: status.color,
              color: status.color,
              backgroundColor: `${status.color}14`,
            }}
          >
            {status.name}
          </span>
        ) : null}
      </div>
      {updatedAt ? (
        <p className="mt-2 text-xs text-text-muted">{formatRelativeTime(updatedAt)}</p>
      ) : null}
    </Link>
  );
}

function ComplaintListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading complaints">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function ComplaintSection({
  title,
  issues,
  emptyLabel,
}: {
  title: string;
  issues: Issue[];
  emptyLabel: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {issues.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => <ComplaintRow key={issue.id} issue={issue} />)}
        </div>
      )}
    </section>
  );
}

export function ComplaintList() {
  const { data: issues = [], isLoading, error } = useComplaints();

  const activeIssues = issues.filter((issue) => !isComplaintClosed(issue));
  const pastIssues = issues.filter((issue) => isComplaintClosed(issue));

  if (isLoading) {
    return <ComplaintListSkeleton />;
  }

  if (error) {
    return (
      <EmptyState>
        <p className="text-sm text-text-muted">Could not load complaints. Try again.</p>
      </EmptyState>
    );
  }

  if (issues.length === 0) {
    return (
      <EmptyState
        action={
          <Link
            href="/complaints/new"
            className={cn(buttonVariants({ variant: "primary", size: "sm" }), "gap-2")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New complaint
          </Link>
        }
      >
        <p className="text-sm text-text-muted">
          No complaints yet. When your parent files a complaint, it will show up here.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      <ComplaintSection
        title="Active"
        issues={activeIssues}
        emptyLabel="No active complaints."
      />
      <ComplaintSection
        title="Past"
        issues={pastIssues}
        emptyLabel="No past complaints."
      />
    </div>
  );
}
