"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

import { useCourseHub } from "@/contexts/course-hub-context";
import { canManageCourseRoster } from "@/helpers/authorization";
import { getCreatedByIdFromCourse } from "@/helpers/course-hub";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";

const TABS = [
  {
    label: "Roster",
    href: (id: string) => `/courses/${id}/students`,
    match: (pathname: string, href: string) => pathname === href,
  },
  {
    label: "History",
    href: (id: string) => `/courses/${id}/students/history`,
    match: (pathname: string, href: string) => pathname.startsWith(href),
  },
] as const;

export function StudentsSubNav() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { user } = useUser();
  const { course, teacherMemberIds } = useCourseHub();

  const showHistory = Boolean(
    user &&
      course &&
      canManageCourseRoster(
        user,
        teacherMemberIds,
        getCreatedByIdFromCourse(course),
      ),
  );

  if (!showHistory) {
    return null;
  }

  return (
    <nav className="mb-4 flex gap-1 border-b">
      {TABS.map((tab) => {
        const href = tab.href(id);
        const active = tab.match(pathname, href);
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              active
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
