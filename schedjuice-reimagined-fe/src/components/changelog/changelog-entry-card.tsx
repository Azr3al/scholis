"use client";

import type { ChangelogEntry } from "@/content/changelog/types";
import { ChangelogCategoryBadge } from "@/components/changelog/changelog-category-badge";
import { ChangelogScreenshotGallery } from "@/components/changelog/changelog-screenshot-gallery";
import Link from "next/link";
import { ArrowUpRight, Camera as CameraOff } from "iconoir-react";
import { cn } from "@/lib/utils";

type ChangelogEntryCardProps = {
  entry: ChangelogEntry;
  /** Show internal notes (e.g. pending screenshots) — hidden from students */
  showStaffNotes?: boolean;
  className?: string;
};

function formatPublishedDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ChangelogEntryCard({
  entry,
  showStaffNotes = false,
  className,
}: ChangelogEntryCardProps) {
  const showScreenshotPending =
    entry.screenshotStatus === "needs_capture" && entry.screenshots.length === 0;

  return (
    <article
      id={entry.id}
      className={cn(
        "scroll-mt-24 rounded-[1.75rem] border border-border/60 bg-surface-elevated p-6 sm:p-8",
        "shadow-[0_20px_40px_-24px_rgba(0,0,0,0.12)]",
        className,
      )}
    >
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <time
            dateTime={entry.publishedAt}
            className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted"
          >
            {formatPublishedDate(entry.publishedAt)}
          </time>
          {entry.categories.map((category) => (
            <ChangelogCategoryBadge key={category} category={category} />
          ))}
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-[1.65rem]">
            {entry.title}
          </h2>
          <p className="max-w-[65ch] text-base leading-relaxed text-text-muted">
            {entry.summary}
          </p>
        </div>
      </header>

      {entry.bullets.length > 0 ? (
        <ul className="mt-6 space-y-2.5 text-sm leading-relaxed text-text-primary/90">
          {entry.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3">
              <span
                aria-hidden
                className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/35"
              />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {entry.affectedAreas.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {entry.affectedAreas.map((area) => (
            <Link
              key={area.href}
              href={area.href}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-sunken/30 px-3 py-1.5",
                "text-xs font-medium text-text-primary/85 transition-colors hover:bg-accent/60",
              )}
            >
              {area.label}
              <ArrowUpRight className="size-3.5 opacity-60" aria-hidden />
            </Link>
          ))}
        </div>
      ) : null}

      {entry.screenshots.length > 0 ? (
        <ChangelogScreenshotGallery
          screenshots={entry.screenshots}
          className="mt-8"
        />
      ) : null}

      {showScreenshotPending && showStaffNotes ? (
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-dashed border-border/80 bg-surface-sunken/20 px-4 py-3">
          <CameraOff className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-primary/90">
              Screenshots pending capture
            </p>
            <p className="text-xs leading-relaxed text-text-muted">
              Run <code className="rounded bg-surface-sunken px-1 py-0.5">/summarize-changelog</code>{" "}
              with browser automation, or add images under{" "}
              <code className="rounded bg-surface-sunken px-1 py-0.5">
                public/changelog/{entry.publishedAt}-*/
              </code>
            </p>
          </div>
        </div>
      ) : null}
    </article>
  );
}
