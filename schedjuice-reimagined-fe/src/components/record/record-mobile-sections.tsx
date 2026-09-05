"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleRecordRailLinks } from "./record-rail-links";
import { visibleSections, type RecordSectionId } from "./record-sections";
import { cn } from "@/lib/utils";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

/** In-content section selector for mobile (no second rail below md). */
export function RecordMobileSections({
  subject,
  viewer,
  tenant,
  section,
  onSelect,
}: {
  subject: accountType;
  viewer: accountType;
  tenant: organizationType | null;
  section: RecordSectionId;
  onSelect: (s: RecordSectionId) => void;
}) {
  const pathname = usePathname();
  const ctx = { tenant, subject, viewer };
  const isProfileSubRoute = pathname.startsWith(`/users/${subject.id}/`);

  return (
    <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden">
      {visibleSections(ctx).map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          aria-current={!isProfileSubRoute && section === s.id ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
            !isProfileSubRoute && section === s.id
              ? "bg-accent text-accent-foreground"
              : "text-text-secondary hover:bg-surface-hover",
          )}
        >
          {s.label}
        </button>
      ))}
      {visibleRecordRailLinks(ctx).map((link) => {
        const href = `/users/${subject.id}/${link.pathSuffix}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={link.pathSuffix}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-text-secondary hover:bg-surface-hover",
            )}
          >
            {link.label(ctx)}
          </Link>
        );
      })}
    </div>
  );
}
