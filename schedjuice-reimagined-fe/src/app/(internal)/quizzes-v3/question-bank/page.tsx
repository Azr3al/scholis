"use client";

import { questionBankColumns } from "@/app/(internal)/quizzes-v3/question-bank/question-bank-columns";
import { AcademicListSurface } from "@/components/academic/academic-list-surface";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { buttonVariants, Select } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { cn } from "@/lib/utils";
import { useQuizQuestionsList } from "@/sdk/hooks/quiz-questions";
import { operatorEnum } from "@/types/api";
import Link from "next/link";
import { useMemo, useState } from "react";

const QUESTION_TYPE_ITEMS = [
  { value: "all", label: "All types" },
  { value: "SINGLE_CHOICE", label: "Single choice" },
  { value: "MULTIPLE_CHOICE", label: "Multiple choice" },
];

export default function QuestionBankPage() {
  const [questionTypeFilter, setQuestionTypeFilter] = useState<string>("all");
  const tableState = useResourceTableState({
    namespace: "quiz-questions-bank",
    syncUrl: false,
    initial: { sorts: ["-created_at"] },
  });

  const filterParams = useMemo(() => {
    if (questionTypeFilter === "all") return undefined;
    return [
      {
        field_name: "question_type",
        operator: operatorEnum.exact,
        value: questionTypeFilter,
      },
    ];
  }, [questionTypeFilter]);

  const list = useQuizQuestionsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-created_at"],
    q: tableState.q,
    filterParams,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <div className="min-w-0">
          <h1 className="truncate font-serif text-lg text-text-primary">Question Bank</h1>
          <p className="truncate text-xs text-text-muted">
            Browse reusable questions that back quizzes and assessments.
          </p>
        </div>
      ),
      actions: (
        <Link
          href="/quizzes-v3"
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "w-auto min-w-[8rem]",
          )}
        >
          Back to quizzes
        </Link>
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
            columns={questionBankColumns}
            getRowId={(row) => String(row.id)}
            filterSlot={
              <div className="grid w-full gap-1">
                <label
                  htmlFor="qb-type"
                  className="text-sm font-medium text-text-primary"
                >
                  Question type
                </label>
                <Select
                  value={questionTypeFilter}
                  onValueChange={(v) => {
                    setQuestionTypeFilter(String(v));
                    tableState.setState({ page: 1 });
                  }}
                  items={QUESTION_TYPE_ITEMS}
                  placeholder="All types"
                  className="w-full max-w-[220px]"
                />
              </div>
            }
          />
        </AcademicListSurface>
      </PageSection>
    </PageContainer>
  );
}
