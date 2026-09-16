"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  courseRecordHref,
  courseRecordNavActive,
  visibleCourseRecordNavSections,
} from "@/config/course-record-nav";
import { cn } from "@/lib/utils";
import type { courseType } from "@/types/course";
import type { organizationType } from "@/types/organization";
import type { accountType } from "@/types/user";

export function CourseMobileSections({
  courseId,
  course,
  user,
  tenant,
}: {
  courseId: string;
  course: courseType;
  user: accountType | undefined;
  tenant: organizationType | null;
}) {
  const pathname = usePathname();
  const { overview, groups } = visibleCourseRecordNavSections(user, course, tenant);
  const entries = [
    ...(overview ? [overview] : []),
    ...groups.flatMap((group) => group.entries),
  ];

  return (
    <nav
      aria-label="Course sections"
      className="sj-root -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:hidden"
    >
      {entries.map((entry) => {
        const href = courseRecordHref(courseId, entry);
        const active = courseRecordNavActive(entry.id, pathname, courseId);
        return (
          <Link
            key={entry.id}
            href={href}
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
