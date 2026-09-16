"use client";

import {
  ResourceTable,
  column,
  useResourceTableState,
} from "@/components/data-table";
import { buttonVariants, Tabs } from "@/components/primitives";
import { formatDateTime } from "@/helpers/date";
import { cn } from "@/lib/utils";
import { useAssignmentsList } from "@/sdk/hooks/assignments";
import { useQuizzesList } from "@/sdk/hooks/quizzes";
import type { Assignment } from "@/sdk/_types/assignments";
import type { Quiz } from "@/sdk/_types/quizzes";
import { operatorEnum } from "@/types/api";
import Link from "next/link";
import { useMemo } from "react";

type CourseAssessmentsGradingPanelProps = {
  courseId: string;
  /** When true, hide per-tab create actions (parent hub provides Add menu). */
  embedded?: boolean;
};

export function CourseAssessmentsGradingPanel({
  courseId,
  embedded = false,
}: CourseAssessmentsGradingPanelProps) {
  const quizzesState = useResourceTableState({
    namespace: "course-quizzes",
    syncUrl: false,
  });
  const assignmentsState = useResourceTableState({
    namespace: "course-assignments",
    syncUrl: false,
    initial: { sorts: ["-created_at"] },
  });

  const courseFilter = useMemo(
    () => [
      {
        field_name: "course",
        operator: operatorEnum.exact,
        value: courseId,
      },
    ],
    [courseId],
  );

  const quizzesList = useQuizzesList({
    page: quizzesState.page,
    pageSize: quizzesState.pageSize,
    sorts: quizzesState.sorts,
    q: quizzesState.q,
    expand: ["category", "created_by"],
    filterParams: courseFilter,
  });

  const assignmentsList = useAssignmentsList({
    page: assignmentsState.page,
    pageSize: assignmentsState.pageSize,
    sorts: assignmentsState.sorts,
    q: assignmentsState.q,
    expand: ["submissions"],
    filterParams: courseFilter,
  });

  const quizColumns = useMemo(
    () => [
      column.text<Quiz>({
        id: "id",
        header: "ID",
        accessor: (row) => String(row.id),
      }),
      column.text<Quiz>({
        id: "title",
        header: "Title",
        accessor: (row) => row.title ?? "",
      }),
      column.text<Quiz>({
        id: "status",
        header: "Status",
        accessor: (row) => row.status ?? "",
      }),
      column.text<Quiz>({
        id: "created_at",
        header: "Created At",
        accessor: (row) =>
          row.created_at ? formatDateTime(row.created_at) : "",
      }),
      column.text<Quiz>({
        id: "category",
        header: "Category",
        accessor: (row) => row.category?.title ?? row.category?.name ?? "-",
      }),
      column.text<Quiz>({
        id: "created_by__name",
        header: "Created By",
        accessor: (row) => row.created_by?.name ?? "",
      }),
    ],
    [],
  );

  const assignmentColumns = useMemo(
    () => [
      column.text<Assignment>({
        id: "id",
        header: "ID",
        accessor: (row) => String(row.id),
      }),
      column.text<Assignment>({
        id: "title",
        header: "Title",
        accessor: (row) => row.title ?? "",
      }),
      column.text<Assignment>({
        id: "available_date",
        header: "Available Date",
        accessor: (row) =>
          row.available_date ? formatDateTime(row.available_date) : "",
      }),
      column.text<Assignment>({
        id: "due_date",
        header: "Due Date",
        accessor: (row) => (row.due_date ? formatDateTime(row.due_date) : ""),
      }),
      column.text<Assignment>({
        id: "created_at",
        header: "Created At",
        accessor: (row) =>
          row.created_at ? formatDateTime(row.created_at) : "",
      }),
      column.text<Assignment>({
        id: "updated_at",
        header: "Updated At",
        accessor: (row) =>
          row.updated_at ? formatDateTime(row.updated_at) : "",
      }),
      column.text<Assignment>({
        id: "submissions",
        header: "Total submissions",
        accessor: (row) => String(row.submissions?.length ?? 0),
      }),
    ],
    [],
  );

  return (
    <Tabs.Root defaultValue="quizzes">
      <Tabs.List className="w-full">
        <Tabs.Indicator />
        <Tabs.Tab className="w-[50%]" value="quizzes">
          Quizzes
        </Tabs.Tab>
        <Tabs.Tab className="w-[50%]" value="assignments">
          Assignments
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="quizzes" className="space-y-3">
        {!embedded ? (
          <div className="flex justify-end">
            <Link href="/quizzes-v3/create" className={cn(buttonVariants())}>
              Create quiz
            </Link>
          </div>
        ) : null}
        <ResourceTable
          list={quizzesList}
          tableState={quizzesState}
          columns={quizColumns}
          getRowId={(row) => String(row.id)}
          rowHref={(row) => `/quizzes-v3/${row.id}/responses`}
        />
      </Tabs.Panel>
      <Tabs.Panel value="assignments" className="space-y-3">
        {!embedded ? (
          <div className="flex justify-end">
            <Link
              href={`/courses/${courseId}/assessments`}
              className={cn(buttonVariants())}
            >
              Create assignment
            </Link>
          </div>
        ) : null}
        <ResourceTable
          list={assignmentsList}
          tableState={assignmentsState}
          columns={assignmentColumns}
          getRowId={(row) => String(row.id)}
          rowHref={(row) => `/assignments/${row.id}`}
        />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
