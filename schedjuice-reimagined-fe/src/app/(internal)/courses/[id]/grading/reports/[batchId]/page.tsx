"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/courses/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import {
  getReportBatch,
  regenerateReportBatch,
} from "@/lib/grading-reports-api";

export default function ReportBatchPage() {
  const { id, batchId } = useParams<{ id: string; batchId: string }>();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canManage = can("grade.manage");
  const numericBatchId = Number(batchId);

  const batchQuery = useQuery({
    queryKey: ["report-batch", numericBatchId],
    queryFn: () => getReportBatch(numericBatchId),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateReportBatch(numericBatchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-batch", numericBatchId] });
    },
  });

  const batch = batchQuery.data;
  const reports = batch?.reports ?? [];

  return (
    <PageContainer width="wide" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/courses/${id}/grading/reports`}
            className="text-primary text-sm hover:underline"
          >
            Back to reports
          </Link>
          <h1 className="text-xl">Report batch</h1>
          {batch ? (
            <p className="text-text-secondary text-sm">
              {batch.finalized_count ?? 0}/{batch.total_count ?? 0} finalized
            </p>
          ) : null}
        </div>
        {canManage ? (
          <Button
            variant="secondary"
            isLoading={regenerateMutation.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Regenerate draft reports from current sheet data? Unsaved remarks and ratings on drafts will be lost.",
                )
              ) {
                regenerateMutation.mutate();
              }
            }}
          >
            Regenerate drafts
          </Button>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Overall grade</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => (
            <TableRow key={report.id}>
              <TableCell>
                <Link
                  href={`/courses/${id}/grading/reports/${batchId}/${report.student}`}
                  className="text-primary hover:underline"
                >
                  {report.student_name}
                </Link>
              </TableCell>
              <TableCell>{report.overall.grade}</TableCell>
              <TableCell className="capitalize">{report.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PageContainer>
  );
}
