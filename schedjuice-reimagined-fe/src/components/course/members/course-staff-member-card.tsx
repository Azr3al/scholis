"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "iconoir-react";

import { CourseTeacherScheduleSheet } from "@/components/course/members/course-teacher-schedule-sheet";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type CourseStaffMemberCardRow = {
  user?: { id?: number; name?: string; email?: string };
  assigned_as_role?: { name?: string };
};

export interface CourseStaffMemberCardProps {
  row: CourseStaffMemberCardRow;
  courseId: string | number;
  events?: any[];
  baseDetailsPath: string;
  hideProfileLink?: boolean;
}

export function CourseStaffMemberCard({
  row,
  courseId,
  events,
  baseDetailsPath,
  hideProfileLink,
}: CourseStaffMemberCardProps) {
  const pathname = usePathname();
  const user = row.user;
  const name = user?.name?.trim() || "—";
  const email = user?.email?.trim();
  const roleName = row.assigned_as_role?.name?.trim();
  const userId = user?.id;

  const profileHref =
    userId != null
      ? `${baseDetailsPath}/${userId}?ref=${encodeURIComponent(
          `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`,
        )}`
      : null;

  return (
    <div className="rounded-lg border border-border bg-card gap-0 py-4 transition-colors">
      <div className="gap-0 space-y-0 px-4 pb-1.5 pt-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold tracking-tight">
            {name}
          </h3>
          {!hideProfileLink && profileHref && (
            <Link
              href={profileHref}
              aria-label={`Open profile for ${name}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "shrink-0"
              )}
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 px-4 pb-0 pt-0">
        {email ? (
          <p className="text-sm text-muted-foreground break-words">{email}</p>
        ) : null}
        {roleName ? (
          <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs text-text-secondary w-fit font-normal">
            {roleName}
          </span>
        ) : null}
        <CourseTeacherScheduleSheet
          courseId={courseId}
          userId={userId}
          events={events}
          personName={name !== "—" ? name : undefined}
        />
      </div>
    </div>
  );
}
