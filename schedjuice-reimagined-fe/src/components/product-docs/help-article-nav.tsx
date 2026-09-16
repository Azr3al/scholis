"use client";

import Link from "next/link";

import type { DocArticleSummary } from "@/types/product-docs";

export function HelpArticleNav({
  articles,
  currentSlug,
}: {
  articles: DocArticleSummary[];
  currentSlug: string;
}) {
  const index = articles.findIndex((a) => a.slug === currentSlug);
  const previous = index > 0 ? articles[index - 1] : null;
  const next = index >= 0 && index < articles.length - 1 ? articles[index + 1] : null;

  if (!previous && !next) return null;

  return (
    <nav
      aria-label="Article navigation"
      className="flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:justify-between"
    >
      {previous ? (
        <Link href={`/help/${previous.slug}`} className="group max-w-sm space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Previous</p>
          <p className="text-sm font-medium group-hover:underline">{previous.title}</p>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/help/${next.slug}`}
          className="group max-w-sm space-y-1 sm:text-right"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Next</p>
          <p className="text-sm font-medium group-hover:underline">{next.title}</p>
        </Link>
      ) : null}
    </nav>
  );
}
