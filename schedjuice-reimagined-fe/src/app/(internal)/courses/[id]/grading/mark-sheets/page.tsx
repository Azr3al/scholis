"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useParams } from "next/navigation";

import { buttonVariants } from "@/components/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/courses/ui/table";
import { formatDate } from "@/helpers/date";
import { usePermissions } from "@/hooks/usePermissions";
import { listMarkSheets } from "@/lib/mark-sheets-api";
import type { MarkSheet } from "@/types/mark-sheets";

function groupByMonth(sheets: MarkSheet[]): Map<string, MarkSheet[]> {
  const groups = new Map<string, MarkSheet[]>();
  for (const sheet of sheets) {
    const key = `${sheet.year}-${String(sheet.month).padStart(2, "0")}`;
    const arr = groups.get(key) ?? [];
    arr.push(sheet);
    groups.set(key, arr);
  }
  return new Map(Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0])));
}

export default function CourseMarkSheetsPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const canManage = can("grade.manage");

  const sheetsQuery = useQuery({
    queryKey: ["mark-sheets", id],
    queryFn: () => listMarkSheets(id),
  });

  const grouped = groupByMonth(sheetsQuery.data ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl">Mark Sheets</h1>
        {canManage ? (
          <Link
            href={`/courses/${id}/grading/mark-sheets/new`}
            className={buttonVariants({ variant: "primary", size: "md" })}
          >
            Add mark sheet
          </Link>
        ) : null}
      </div>

      {Array.from(grouped.entries()).map(([monthKey, sheets]) => {
        const [year, month] = monthKey.split("-").map(Number);
        const monthLabel = format(new Date(year, month - 1, 1), "MMMM yyyy");
        return (
          <section key={monthKey} className="space-y-2">
            <h2 className="text-lg font-medium">{monthLabel}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Rubric</TableHead>
                  <TableHead>Exam date</TableHead>
                  <TableHead>Cells filled</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheets.map((sheet) => (
                  <TableRow key={sheet.id}>
                    <TableCell>
                      <Link
                        href={`/courses/${id}/grading/mark-sheets/${sheet.id}`}
                        className="text-primary hover:underline"
                      >
                        {sheet.title}
                      </Link>
                    </TableCell>
                    <TableCell>{sheet.rubric_title ?? "—"}</TableCell>
                    <TableCell>
                      {sheet.exam_date
                        ? formatDate(sheet.exam_date, "d.M.yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>{sheet.filled_cell_count ?? 0}</TableCell>
                    <TableCell>
                      {sheet.updated_at ? formatDate(sheet.updated_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        );
      })}

      {!sheetsQuery.isLoading && (sheetsQuery.data?.length ?? 0) === 0 ? (
        <p className="text-text-secondary text-sm">
          No mark sheets yet. Add one to start entering external test scores.
        </p>
      ) : null}
    </div>
  );
}
