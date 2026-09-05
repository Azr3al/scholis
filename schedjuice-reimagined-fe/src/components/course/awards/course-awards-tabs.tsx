"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "mark-sheets", label: "Mark Sheets" },
  { segment: "awards", label: "Awards" },
] as const;

export function CourseAwardsTabs({ courseId }: { courseId?: string }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const id = courseId ?? params.id;
  const base = `/courses/${id}/grading`;

  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-border-subtle"
      aria-label="Grading sections"
    >
      {TABS.map(({ segment, label }) => {
        const href = `${base}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={segment}
            href={href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
