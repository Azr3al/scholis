"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ADMISSIONS_RECORD_NAV_ENTRIES,
  admissionsRecordNavActive,
} from "@/config/admissions-record-nav";
import { cn } from "@/lib/utils";

export function AdmissionsMobileSections() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admissions sections"
      className="sj-root -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden"
    >
      {ADMISSIONS_RECORD_NAV_ENTRIES.map((entry) => {
        const active = admissionsRecordNavActive(entry, pathname);
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
