"use client";

import { Book, Eye, GraduationCap } from "iconoir-react";
import { Avatar } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { IssueSource, type Issue, type IssueUserMini } from "@/types/issue";

function resolveUserMini(value: number | IssueUserMini | null): IssueUserMini | null {
  return value && typeof value === "object" ? value : null;
}

function resolveCourseTitle(value: Issue["related_course"]): string | null {
  if (!value || typeof value !== "object") return null;
  const title = (value as Record<string, unknown>).title;
  return typeof title === "string" ? title : null;
}

export function IssueCardContent({
  issue,
  overlay = false,
}: {
  issue: Issue;
  overlay?: boolean;
}) {
  const assignee = resolveUserMini(issue.assignee);
  const student = resolveUserMini(issue.related_student);
  const courseTitle = resolveCourseTitle(issue.related_course);
  const observerCount = issue.observers?.length ?? 0;

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-border bg-surface-elevated p-3 text-left",
        overlay
          ? "rotate-2 cursor-grabbing border-border-strong shadow-lg"
          : "shadow-sm",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 font-medium text-text-primary">{issue.title}</div>
        {issue.source === IssueSource.ParentComplaint && (
          <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
            Parent complaint
          </span>
        )}
        {issue.is_anonymous && (
          <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-text-secondary">
            Anonymous
          </span>
        )}
      </div>

      {(student || courseTitle) && !issue.is_anonymous && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {student && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-xs text-text-secondary">
              <GraduationCap className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{student.name}</span>
            </span>
          )}
          {courseTitle && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface px-1.5 py-0.5 text-xs text-text-secondary">
              <Book className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{courseTitle}</span>
            </span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        {assignee ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Avatar src={undefined} name={assignee.name} className="size-5 shrink-0 text-[10px]" />
            <span className="truncate text-xs text-text-secondary">{assignee.name}</span>
          </span>
        ) : (
          <span className="text-xs text-text-muted">Unassigned</span>
        )}
        {observerCount > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 text-xs text-text-muted"
            aria-label={`${observerCount} observer${observerCount === 1 ? "" : "s"}`}
          >
            <Eye className="h-3 w-3" aria-hidden />
            {observerCount}
          </span>
        )}
      </div>
    </div>
  );
}
