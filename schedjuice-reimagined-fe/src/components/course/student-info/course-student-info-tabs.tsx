"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "profile", label: "Profile" },
  { segment: "photo-gallery", label: "Photo Gallery" },
  { segment: "academic-performance", label: "Academic Performance" },
] as const;

export function CourseStudentInfoTabs({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const base = `/courses/${courseId}/student-info`;

  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-border-subtle"
      aria-label="Student info sections"
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
