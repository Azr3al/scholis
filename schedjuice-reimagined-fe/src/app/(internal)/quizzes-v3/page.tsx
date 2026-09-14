"use client";

import { quizColumns } from "@/app/(internal)/quizzes-v3/quiz-columns";
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { buttonVariants } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { contentListToolbarClassName } from "@/lib/ui-remediation/r10-content-route-classes";
import { cn } from "@/lib/utils";
import { useQuizzesList } from "@/sdk/hooks/quizzes";
import { operatorEnum } from "@/types/api";
import Link from "next/link";
import { useMemo } from "react";

export default function QuizzesV3ListPage() {
  const tableState = useResourceTableState({
    namespace: "quizzes-v3",
    syncUrl: false,
    initial: { sorts: ["-created_at"] },
  });
  const filterParams = useMemo(
    () => [
      {
        field_name: "course",
        operator: operatorEnum.isnull,
        value: "true",
      },
    ],
    [],
  );
  const list = useQuizzesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-created_at"],
    q: tableState.q,
    expand: ["category", "created_by"],
    filterParams,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <div className="min-w-0">
          <h1 className="truncate font-serif text-lg text-text-primary">Quizzes</h1>
          <p className="truncate text-xs text-text-muted">
            Create and manage academic assessments that can be assigned to courses and
            classes.
          </p>
        </div>
      ),
      actions: (
        <div className={contentListToolbarClassName()}>
          <Link
            href="/quizzes-v3/question-bank"
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "w-auto min-w-[8rem]",
            )}
          >
            Question Bank
          </Link>
          <Link
            href="/quizzes-v3/create"
            className={cn(
              buttonVariants({ variant: "primary", size: "sm" }),
              "w-auto min-w-[8rem]",
            )}
          >
            Create quiz
          </Link>
        </div>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="wide" className="flex flex-col gap-6">
      <PageSection dominant>
        <AcademicListSurface>
          <ResourceTable
            list={list}
            tableState={tableState}
            columns={quizColumns}
            getRowId={(row) => String(row.id)}
            rowHref={(row) => `/quizzes-v3/${row.id}`}
          />
        </AcademicListSurface>
      </PageSection>
    </PageContainer>
  );
}
