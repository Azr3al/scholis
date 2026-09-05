"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  financeRecordNavActive,
  visibleFinanceRecordNavSections,
} from "@/config/finance-record-nav";
import { cn } from "@/lib/utils";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export function FinanceMobileSections({
  user,
  tenant,
  canAny,
}: {
  user: accountType | undefined;
  tenant: organizationType | null;
  canAny: (codes: string[]) => boolean;
}) {
  const pathname = usePathname();
  const { overview, groups } = visibleFinanceRecordNavSections(user, tenant, canAny);
  const entries = [
    ...(overview ? [overview] : []),
    ...groups.flatMap((group) => group.entries),
  ];

  if (!entries.length) {
    return null;
  }

  return (
    <nav
      aria-label="Finance sections"
      className="sj-root -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden"
    >
      {entries.map((entry) => {
        const active = financeRecordNavActive(entry, pathname);
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
