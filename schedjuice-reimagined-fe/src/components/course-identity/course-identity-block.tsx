"use client";

import {
  buildCourseBreadcrumb,
  courseStatusLabel,
  formatCourseSchedulePattern,
} from "@/helpers/course-identity";
import { cn } from "@/lib/utils";
import { getTeachingRoleBadgeProps } from "@/helpers/course/roster-table-utils";
import { SubjectChips } from "./subject-chips";
import type {
  CourseIdentityCourse,
  RecordIdentityExtras,
} from "./course-identity-types";

type HubProps = {
  variant: "hub";
  course: CourseIdentityCourse;
  showBreadcrumb?: boolean;
  showTitle?: boolean;
};

type RailProps = {
  variant: "rail";
  course: CourseIdentityCourse;
};

type RecordProps = {
  variant: "record";
  course: CourseIdentityCourse;
} & RecordIdentityExtras;

type Props = HubProps | RailProps | RecordProps;

function TeachingPill() {
  return (
    <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-accent">
      Teaching
    </span>
  );
}

export function CourseIdentityBlock(props: Props) {
  const { course, variant } = props;
  const breadcrumb = buildCourseBreadcrumb(course);
  const schedule = formatCourseSchedulePattern(course);

  if (variant === "rail") {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-primary">
          {course.title ?? "Untitled course"}
        </p>
        {course.code ? (
          <p className="truncate font-mono text-xs text-text-muted">
            {course.code}
          </p>
        ) : null}
      </div>
    );
  }

  if (variant === "record") {
    const { assignedRoleName, roleSeniority, isShared, nextSessionLabel } =
      props;
    const badge = getTeachingRoleBadgeProps(roleSeniority, assignedRoleName);
    const meta = [course.code, badge.show ? null : assignedRoleName, schedule]
      .filter(Boolean)
      .join(" · ");
    const status = courseStatusLabel(course.status);
    const statusColor =
      course.status === "active" || course.status === "planned"
        ? "text-success"
        : "text-text-muted";

    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-xs text-text-muted">
            {breadcrumb || "Course"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {isShared ? <TeachingPill /> : null}
            <span className={cn("text-xs font-medium", statusColor)}>
              {status}
            </span>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="font-serif text-lg text-text-primary group-hover:text-accent">
            {course.title ?? "Untitled course"}
          </p>
          {badge.show ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                badge.variant === "main"
                  ? "bg-brand/10 text-accent"
                  : "border border-border-strong text-text-secondary",
              )}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        <SubjectChips source={course} maxVisible={2} variant="record" />
        {meta ? (
          <p className="mt-0.5 text-sm text-text-muted">{meta}</p>
        ) : null}
        {nextSessionLabel ? (
          <p className="mt-2 text-right text-sm text-text-secondary">
            Next: {nextSessionLabel} →
          </p>
        ) : null}
      </>
    );
  }

  const showBreadcrumb = props.showBreadcrumb ?? true;
  const showTitle = props.showTitle ?? true;

  return (
    <>
      {showBreadcrumb && breadcrumb ? (
        <p className="truncate text-xs text-muted-foreground">{breadcrumb}</p>
      ) : null}
      {showTitle ? (
        <div className="space-y-0.5">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            {course.title}
          </h3>
          {course.code ? (
            <p className="font-mono text-xs text-muted-foreground">{course.code}</p>
          ) : null}
        </div>
      ) : course.code ? (
        <p className="font-mono text-xs text-muted-foreground">{course.code}</p>
      ) : null}
      <SubjectChips source={course} maxVisible={3} variant="hub" />
    </>
  );
}
