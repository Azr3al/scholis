"use client";

import { SubjectUsageStat } from "@/components/academic/subject-usage-stat";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/reports/report-table";
import { cn } from "@/lib/utils";
import { subjectType } from "@/types/subject";
import { SubjectUsageRow } from "@/types/subject-usage";
import Link from "next/link";

interface SubjectCatalogTableProps {
  subjects: subjectType[];
  usageById: Map<number, SubjectUsageRow>;
  includeAllCourses: boolean;
  isLoading?: boolean;
  isUsageError?: boolean;
}

const TABLE_HEAD_CLASS =
  "h-11 px-4 text-xs font-medium uppercase tracking-wide text-text-secondary";

const TABLE_CELL_CLASS = "px-4 py-3.5 align-middle";

function formatPrograms(usageRow?: SubjectUsageRow): string {
  const names = usageRow?.programs.map((p) => p.name) ?? [];
  if (names.length === 0) return "—";
  if (names.length <= 2) return names.join(", ");
  return `${names.length} programs`;
}

function formatDescription(subject: subjectType): string {
  const description = subject.description?.trim();
  return description || "—";
}

export function SubjectCatalogTable({
  subjects,
  usageById,
  includeAllCourses,
  isLoading = false,
  isUsageError = false,
}: SubjectCatalogTableProps) {
  if (isLoading) {
    return <TableSkeleton columns={5} rows={8} />;
  }

  if (subjects.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-text-muted">
        No subjects found. Create a subject to start building your academic catalog.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-elevated">
      <Table>
        <TableHeader>
          <TableRow className="border-border-subtle hover:bg-transparent">
            <TableHead className={TABLE_HEAD_CLASS}>Subject</TableHead>
            <TableHead className={cn(TABLE_HEAD_CLASS, "hidden md:table-cell")}>
              Exam board
            </TableHead>
            <TableHead className={cn(TABLE_HEAD_CLASS, "hidden lg:table-cell")}>
              Description
            </TableHead>
            <TableHead className={TABLE_HEAD_CLASS}>Programs</TableHead>
            <TableHead className={cn(TABLE_HEAD_CLASS, "text-right")}>Courses</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subjects.map((subject, index) => {
            const usageRow = usageById.get(subject.id);

            return (
              <TableRow
                key={subject.id}
                className={cn(
                  "min-h-[52px] border-border-subtle",
                  index % 2 === 1 && "bg-zebra-row",
                )}
              >
                <TableCell className={cn(TABLE_CELL_CLASS, "font-medium text-text-primary")}>
                  <Link
                    href={`/subjects/${subject.id}`}
                    className="hover:text-primary hover:underline underline-offset-4"
                  >
                    {subject.name}
                  </Link>
                </TableCell>
                <TableCell
                  className={cn(
                    TABLE_CELL_CLASS,
                    "hidden text-text-secondary md:table-cell",
                  )}
                >
                  {subject.exam_board ?? "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    TABLE_CELL_CLASS,
                    "hidden max-w-xs truncate text-text-secondary lg:table-cell",
                  )}
                >
                  {formatDescription(subject)}
                </TableCell>
                <TableCell className={cn(TABLE_CELL_CLASS, "text-text-secondary")}>
                  {formatPrograms(usageRow)}
                </TableCell>
                <TableCell className={cn(TABLE_CELL_CLASS, "text-right tabular-nums")}>
                  <SubjectUsageStat
                    count={usageRow?.count ?? 0}
                    includeAllCourses={includeAllCourses}
                    isError={isUsageError}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
