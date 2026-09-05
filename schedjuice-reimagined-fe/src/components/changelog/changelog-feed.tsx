"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/primitives/spinner";
import { Pagination } from "@/components/data-table/parts/pagination";
import { CHANGELOG_ENTRIES } from "@/content/changelog/entries";
import { ChangelogEntryCard } from "@/components/changelog/changelog-entry-card";
import {
  CHANGELOG_PAGE_SIZE,
  filterChangelogForUser,
  groupChangelogByMonth,
  paginateChangelogEntries,
} from "@/lib/changelog/changelog-utils";
import { useUser } from "@/hooks/useUser";
import { isStudent } from "@/helpers/authorization";
import { Page as ScrollText } from "iconoir-react";

export function ChangelogFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useUser();
  const viewerIsStudent = isStudent(user);

  const requestedPage = Math.max(
    1,
    parseInt(searchParams.get("page") ?? "1", 10) || 1,
  );

  const visibleEntries = filterChangelogForUser(CHANGELOG_ENTRIES, user);
  const paginated = paginateChangelogEntries(
    visibleEntries,
    requestedPage,
    CHANGELOG_PAGE_SIZE,
  );
  const groups = groupChangelogByMonth(paginated.entries);

  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(page));
      }
      const qs = params.toString();
      router.replace(qs ? `/changelog?${qs}` : "/changelog", { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [router, searchParams],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-text-muted" />
      </div>
    );
  }

  if (visibleEntries.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-border/80 bg-surface-sunken/15 px-6 py-16 text-center">
        <ScrollText
          className="mx-auto mb-4 size-8 text-text-muted/70"
          aria-hidden
        />
        <h2 className="text-lg font-medium tracking-tight">
          {viewerIsStudent ? "No updates to show right now" : "No changelog entries yet"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
          {viewerIsStudent
            ? "When there are changes that affect students, they will appear here."
            : "Use the summarize-changelog Cursor command to add the first entry from recent work."}
        </p>
      </div>
    );
  }

  const showPagination = paginated.totalCount > CHANGELOG_PAGE_SIZE;

  return (
    <div className="space-y-8">
      <div className="space-y-12">
        {groups.map((group) => (
          <section key={group.monthKey} aria-labelledby={`changelog-${group.monthKey}`}>
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2
                id={`changelog-${group.monthKey}`}
                className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted"
              >
                {group.monthLabel}
              </h2>
              <span className="text-xs text-text-muted">
                {group.entries.length}{" "}
                {group.entries.length === 1 ? "update" : "updates"}
              </span>
            </div>
            <div className="space-y-6">
              {group.entries.map((entry) => (
                <ChangelogEntryCard
                  key={entry.id}
                  entry={entry}
                  showStaffNotes={!viewerIsStudent}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {showPagination ? (
        <Pagination
          page={paginated.page}
          pageSize={paginated.pageSize}
          totalCount={paginated.totalCount}
          onPageChange={handlePageChange}
        />
      ) : null}
    </div>
  );
}
