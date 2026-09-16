"use client";
import { Button } from "@/components/primitives";

import { CourseInsightsIssueBadge } from "@/components/course-insights/course-insights-filters";
import { OverlapFixPreviewSheet } from "@/components/course-insights/overlap-fix-preview-sheet";
import {
  courseOperationalTableBodyCellClassName,
  courseOperationalTableClassName,
  courseOperationalTableHeadCellClassName,
  courseOperationalTableHeadRowClassName,
  courseOperationalTableShellClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";
import { cn } from "@/lib/utils";
import type { CourseInsightsRow } from "@/types/course-insights";
import { OpenNewWindow as ExternalLink } from "iconoir-react";
import Link from "next/link";
import { useState } from "react";

export function CourseInsightsTable({
  rows,
  canFixOverlaps,
}: {
  rows: CourseInsightsRow[];
  canFixOverlaps: boolean;
}) {
  const [fixTarget, setFixTarget] = useState<CourseInsightsRow | null>(null);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border py-10 text-center text-sm text-muted-foreground">
        No faulty courses match the selected filters.
      </p>
    );
  }

  return (
    <>
      <div className={cn(courseOperationalTableShellClassName(), "rounded-xl border")}>
        <table className={courseOperationalTableClassName()}>
          <thead>
            <tr className={courseOperationalTableHeadRowClassName()}>
              <th className={courseOperationalTableHeadCellClassName()}>Course</th>
              <th className={courseOperationalTableHeadCellClassName()}>Code</th>
              <th className={courseOperationalTableHeadCellClassName()}>Category</th>
              <th className={courseOperationalTableHeadCellClassName()}>Issues</th>
              {canFixOverlaps ? (
                <th className={cn(courseOperationalTableHeadCellClassName(), "w-[180px]")}>
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.course_id}>
                <td className={cn(courseOperationalTableBodyCellClassName(), "font-medium")}>
                  <Link
                    href={`/courses/${row.course_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <span>{row.course_title}</span>
                    <ExternalLink
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </td>
                <td className={cn(courseOperationalTableBodyCellClassName(), "font-mono text-sm")}>
                  {row.course_code || "—"}
                </td>
                <td className={courseOperationalTableBodyCellClassName()}>
                  {row.category_name || "—"}
                </td>
                <td className={courseOperationalTableBodyCellClassName()}>
                  <div className="flex flex-wrap gap-1.5">
                    {row.issues.map((issue) => (
                      <CourseInsightsIssueBadge key={issue} issue={issue} />
                    ))}
                  </div>
                </td>
                {canFixOverlaps ? (
                  <td className={courseOperationalTableBodyCellClassName()}>
                    {row.issues.includes("overlapping_events") ? (
                      <Button
                        type="button"
                        variant="secondary" size="sm"
                        onClick={() => setFixTarget(row)}
                      >
                        Fix / Replace overlapping sessions
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {fixTarget ? (
        <OverlapFixPreviewSheet
          courseId={fixTarget.course_id}
          courseTitle={fixTarget.course_title}
          courseCode={fixTarget.course_code}
          open={fixTarget != null}
          onOpenChange={(open) => {
            if (!open) setFixTarget(null);
          }}
        />
      ) : null}
    </>
  );
}
