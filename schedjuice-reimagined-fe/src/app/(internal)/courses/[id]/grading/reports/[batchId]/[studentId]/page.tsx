"use client";
import { cn } from "@/lib/utils";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedCallback } from "use-debounce";
import { useMemo, useState } from "react";

import { MonthlyReportPreview } from "@/components/grading-reports/monthly-report-preview";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/primitives";
import { axiosClient } from "@/lib/api";
import {
  finalizeMonthlyReport,
  getReportBatch,
  getResolvedGradingScale,
  listResultSheets,
  updateMonthlyReport,
} from "@/lib/grading-reports-api";
import type { MonthlyReport } from "@/types/grading-reports";

export default function StudentReportPage() {
  const { id, batchId, studentId } = useParams<{
    id: string;
    batchId: string;
    studentId: string;
  }>();
  const queryClient = useQueryClient();
  const numericBatchId = Number(batchId);
  const numericStudentId = Number(studentId);
  const [localReport, setLocalReport] = useState<MonthlyReport | null>(null);

  const courseQuery = useQuery({
    queryKey: ["course", id],
    queryFn: async () => {
      const res = await axiosClient.get<{ data: { title: string } }>(`courses/${id}`);
      return res.data.data;
    },
  });
  const batchQuery = useQuery({
    queryKey: ["report-batch", numericBatchId],
    queryFn: () => getReportBatch(numericBatchId),
  });
  const sheetsQuery = useQuery({
    queryKey: ["result-sheets", id],
    queryFn: () => listResultSheets(id),
  });
  const bandsQuery = useQuery({
    queryKey: ["grading-scale", id],
    queryFn: () => getResolvedGradingScale(id),
  });

  const reportFromBatch = useMemo(
    () =>
      batchQuery.data?.reports?.find((r) => r.student === numericStudentId) ??
      null,
    [batchQuery.data, numericStudentId],
  );

  const report = localReport ?? reportFromBatch;

  const examDate =
    sheetsQuery.data?.find((s) => s.id === batchQuery.data?.sheet)?.exam_date ??
    "";

  const saveDebounced = useDebouncedCallback(
    async (payload: Partial<Pick<MonthlyReport, "project_ratings" | "teacher_remarks">>) => {
      if (!report) return;
      await updateMonthlyReport(report.id, payload);
      queryClient.invalidateQueries({ queryKey: ["report-batch", numericBatchId] });
    },
    400,
  );

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeMonthlyReport(report!.id),
    onSuccess: (updated) => {
      setLocalReport(updated);
      queryClient.invalidateQueries({ queryKey: ["report-batch", numericBatchId] });
    },
  });

  const reports = batchQuery.data?.reports ?? [];
  const currentIndex = reports.findIndex((r) => r.student === numericStudentId);
  const prevReport = currentIndex > 0 ? reports[currentIndex - 1] : null;
  const nextReport =
    currentIndex >= 0 && currentIndex < reports.length - 1
      ? reports[currentIndex + 1]
      : null;

  if (!report) {
    return (
      <PageContainer width="narrow">
        <p className="text-text-secondary text-sm">Loading report…</p>
      </PageContainer>
    );
  }

  const editable = report.status === "draft";

  return (
    <PageContainer width="narrow" className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/courses/${id}/grading/reports/${batchId}`}
          className="text-primary text-sm hover:underline"
        >
          Back to batch
        </Link>
        <div className="flex gap-2">
          {prevReport ? (
            <Link
            href={`/courses/${id}/grading/reports/${batchId}/${prevReport.student}`}
            className={cn(buttonVariants({ variant: "secondary", size: "sm"  }))}
          >
            Previous
          </Link>
          ) : null}
          {nextReport ? (
            <Link
            href={`/courses/${id}/grading/reports/${batchId}/${nextReport.student}`}
            className={cn(buttonVariants({ variant: "secondary", size: "sm"  }))}
          >
            Next
          </Link>
          ) : null}
        </div>
      </div>

      <MonthlyReportPreview
        report={report}
        examDate={examDate}
        className={courseQuery.data?.title ?? "Class"}
        gradingBands={bandsQuery.data ?? []}
        editable={editable}
        onProjectRatingsChange={(project_ratings) => {
          const next = { ...report, project_ratings };
          setLocalReport(next);
          saveDebounced({ project_ratings });
        }}
        onRemarksChange={(teacher_remarks) => {
          const next = { ...report, teacher_remarks };
          setLocalReport(next);
          saveDebounced({ teacher_remarks });
        }}
        onFinalize={() => {
          if (report.test_lines.length === 0) {
            if (!window.confirm("This student has no test marks. Finalize anyway?")) {
              return;
            }
          }
          finalizeMutation.mutate();
        }}
        isFinalizing={finalizeMutation.isPending}
      />
    </PageContainer>
  );
}
