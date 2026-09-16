"use client";
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageContainer } from "@/components/layout/page-container";
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
import { listReportBatches, listResultSheets } from "@/lib/grading-reports-api";
import { NavArrowLeft } from "iconoir-react";

export default function GradingReportsPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();
  const canManage = can("grade.manage");

  const batchesQuery = useQuery({
    queryKey: ["report-batches", id],
    queryFn: () => listReportBatches(id),
  });

  const sheetsQuery = useQuery({
    queryKey: ["result-sheets", id],
    queryFn: () => listResultSheets(id),
  });

  const examDateBySheetId = useMemo(() => {
    const map = new Map<number, string>();
    for (const sheet of sheetsQuery.data ?? []) {
      map.set(sheet.id, sheet.exam_date);
    }
    return map;
  }, [sheetsQuery.data]);

  return (
    <PageContainer width="wide" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
          href={`/courses/${id}/grading/mark-sheets`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
          <h1 className="text-xl">Reports</h1>
        </div>
        {canManage ? (
          <Link
            href={`/courses/${id}/grading/reports/create`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Generate monthly reports
          </Link>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead>Exam date</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(batchesQuery.data ?? []).map((batch) => {
            const monthLabel = format(
              new Date(batch.report_year, batch.report_month - 1, 1),
              "MMMM yyyy",
            );
            const examDate = examDateBySheetId.get(batch.sheet);
            return (
              <TableRow key={batch.id}>
                <TableCell>
                  <Link
                    href={`/courses/${id}/grading/reports/${batch.id}`}
                    className="text-primary hover:underline"
                  >
                    {monthLabel}
                  </Link>
                </TableCell>
                <TableCell>
                  {examDate ? formatDate(examDate, "d.M.yyyy") : "—"}
                </TableCell>
                <TableCell>
                  {batch.finalized_count ?? 0}/{batch.total_count ?? 0} finalized
                </TableCell>
                <TableCell>
                  {batch.created_at ? formatDate(batch.created_at) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
