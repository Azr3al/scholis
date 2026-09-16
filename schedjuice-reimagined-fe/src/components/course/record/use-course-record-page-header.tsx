"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavArrowLeft } from "iconoir-react";
import { buttonVariants } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { RecordParentSectionBreadcrumb } from "@/components/shell/record-parent-section-breadcrumb";
import {
  COURSE_CONTEXT_PARENT,
  COURSE_RECORD_NAV_ENTRIES,
  courseRecordNavActive,
  isCourseHubRoute,
} from "@/config/course-record-nav";
import { cn } from "@/lib/utils";
import type { courseType } from "@/types/course";

export function isMarkSheetNewRoute(pathname: string, courseId: string): boolean {
  return pathname === `/courses/${courseId}/grading/mark-sheets/new`;
}

export function markSheetsListHref(courseId: string): string {
  return `/courses/${courseId}/grading/mark-sheets`;
}

function activeSectionLabel(pathname: string, courseId: string): string | null {
  for (const entry of COURSE_RECORD_NAV_ENTRIES) {
    if (courseRecordNavActive(entry.id, pathname, courseId)) {
      return entry.label;
    }
  }
  return null;
}

function subRouteLabel(pathname: string, courseId: string): string | null {
  const base = `/courses/${courseId}/`;
  if (!pathname.startsWith(base)) {
    return null;
  }
  const tail = pathname.slice(base.length).split("/")[0];
  if (!tail || isCourseHubRoute(pathname, courseId)) {
    return null;
  }
  return tail.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function useCourseRecordPageHeader({
  courseId,
  course: _course,
  actions,
}: {
  courseId: string;
  course: courseType | null;
  actions?: ReactNode;
}) {
  const pathname = usePathname();

  const pageHeader = useMemo(() => {
    const section = activeSectionLabel(pathname, courseId);
    const sub = !section ? subRouteLabel(pathname, courseId) : null;
    const extra = section ?? sub;
    const markSheetNew = isMarkSheetNewRoute(pathname, courseId);
    const markSheetsHref = markSheetsListHref(courseId);

    const breadcrumbNav = (
      <RecordParentSectionBreadcrumb
        parent={COURSE_CONTEXT_PARENT}
        section={extra}
        extra={
          markSheetNew ? (
            <>
              <span className="shrink-0 text-text-muted" aria-hidden>
                /
              </span>
              <Link
                href={markSheetsHref}
                className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                Mark sheets
              </Link>
              <span className="shrink-0 text-text-muted" aria-hidden>
                /
              </span>
              <span className="truncate text-text-secondary">New</span>
            </>
          ) : null
        }
      />
    );

    return {
      breadcrumb: markSheetNew ? (
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={markSheetsHref}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "size-9 shrink-0 p-0",
            )}
            aria-label="Back to mark sheets"
          >
            <NavArrowLeft width={16} height={16} aria-hidden />
          </Link>
          {breadcrumbNav}
        </div>
      ) : (
        breadcrumbNav
      ),
      actions,
    };
  }, [pathname, courseId, actions]);

  usePageHeader(pageHeader);
}
