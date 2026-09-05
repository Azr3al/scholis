"use client";

import { PageContainer } from "@/components/layout/page-container";
import { CourseStudentPaymentsReport } from "@/components/finances/student-payments-report";
import { ReportSkeleton } from "@/components/loading/structured-skeletons";
import { usePageHeader } from "@/components/shell/use-page-header";
import Link from "next/link";
import { ArrowLeft } from "iconoir-react";
import { Suspense, useMemo } from "react";
import { useParams } from "next/navigation";

function CourseStudentPaymentsPageInner() {
  const { id } = useParams<{ id: string }>();

  const pageHeader = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Student payments</h1>
      ),
    }),
    [],
  );
  usePageHeader(pageHeader);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/courses/${id}`}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        Course
      </Link>
      <CourseStudentPaymentsReport />
    </div>
  );
}

export default function CourseStudentPaymentsPage() {
  return  (
<PageContainer width="wide">
<Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="inline-flex w-fit items-center gap-2">
            <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="h-4 w-14 rounded bg-muted-foreground animate-pulse" />
          </div>
          <ReportSkeleton tableColumns={8} tableRows={8} />
        </div>
      }
    >
      <CourseStudentPaymentsPageInner />
    </Suspense>
</PageContainer>
);
}
