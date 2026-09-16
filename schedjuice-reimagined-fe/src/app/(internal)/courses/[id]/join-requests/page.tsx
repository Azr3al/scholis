"use client";
import { PageContainer } from "@/components/layout/page-container";
import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { JoinRequestButtons } from "@/components/course/join-request-buttons";
import { operatorEnum } from "@/types/api";
import { courseJoinRequestStatus } from "@/types/course";
import type { CourseJoinRequest } from "@/sdk";
import { useCourseJoinRequestsList } from "@/sdk/hooks/course-join-requests";
import { useParams } from "next/navigation";
import BackButton from "@/components/misc/back-button";
import { useMemo } from "react";

export default function JoinRequestsPage() {
  const { id } = useParams<{ id: string }>();

  const tableState = useResourceTableState({
    namespace: `course-join-requests-${id}`,
    syncUrl: false,
  });
  const filterParams = useMemo(
    () => [
      { field_name: "course", operator: operatorEnum.exact, value: id },
      {
        field_name: "status",
        operator: operatorEnum.exact,
        value: courseJoinRequestStatus.pending,
      },
    ],
    [id],
  );
  const list = useCourseJoinRequestsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["user", "course"],
    filterParams,
  });

  const columns: Column<CourseJoinRequest>[] = useMemo(
    () => [
      column.text<CourseJoinRequest>({
        id: "name",
        header: "Name",
        accessor: (row) => row.user?.name,
      }),
      column.text<CourseJoinRequest>({
        id: "email",
        header: "Email",
        accessor: (row) => row.user?.email,
      }),
      column.date<CourseJoinRequest>({
        id: "created_at",
        header: "Requested Date",
        accessor: (row) => row.created_at,
      }),
      {
        id: "actions",
        header: "Actions",
        accessor: () => null,
        cell: ({ row }) => {
          const courseId =
            typeof row.course === "object" && row.course != null
              ? row.course.id
              : row.course ?? undefined;
          return (
            <JoinRequestButtons
              requestId={row.id}
              courseId={courseId ?? undefined}
              onUpdated={() => list.refetch()}
            />
          );
        },
      },
    ],
    [list],
  );

  return (
    <PageContainer width="wide" className="space-y-3">
      <BackButton href={`/courses/${id}`}></BackButton>
      <h1 className="text-3xl font-bold">Join Requests</h1>
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={columns}
        getRowId={(row) => String(row.id)}
      />
    </PageContainer>
  );
}
