"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  studioRecordNavActive,
  visibleStudioRecordNavEntries,
} from "@/config/studio-record-nav";
import { cn } from "@/lib/utils";

export function StudioMobileSections({
  canDocuments,
  canAwards,
}: {
  canDocuments: boolean;
  canAwards: boolean;
}) {
  const pathname = usePathname();
  const entries = visibleStudioRecordNavEntries({ canDocuments, canAwards });

  if (!entries.length) {
    return null;
  }

  return (
    <nav
      aria-label="Studio sections"
      className="sj-root -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden"
    >
      {entries.map((entry) => {
        const active = studioRecordNavActive(entry, pathname);
        return (
          <Link
            key={entry.id}
            href={entry.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-text-secondary hover:bg-surface-hover",
            )}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
