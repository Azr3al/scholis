"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type RecordParentHref = {
  label: string;
  href: string;
};

/** Parent list + current section. Record name lives in the page H1, not here. */
export function RecordParentSectionBreadcrumb({
  parent,
  section,
  extra,
}: {
  parent: RecordParentHref;
  section: string | null;
  extra?: ReactNode;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 text-sm"
    >
      <Link
        href={parent.href}
        className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
      >
        {parent.label}
      </Link>
      {section ? (
        <>
          <span className="shrink-0 text-text-muted" aria-hidden>
            /
          </span>
          <span className="truncate font-serif text-lg text-text-primary">
            {section}
          </span>
        </>
      ) : null}
      {extra}
    </nav>
  );
}
