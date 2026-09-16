"use client";

import { PageContainer } from "@/components/layout/page-container";
import {
  COURSE_HUB_PAGE_WIDTH,
  courseRecordTabStackClassName,
} from "@/lib/ui-remediation/r9-course-record-layout-classes";

import { CourseOversightTable } from "@/components/course/members/course-oversight-table";
import { CourseTeacherScheduleSheet } from "@/components/course/members/course-teacher-schedule-sheet";
import ScheduleBadgeLegend from "@/components/course/schedule-bade-legend";
import { CourseTabEditBar } from "@/components/course/course-section-header";
import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { useCourseHub } from "@/contexts/course-hub-context";
import { canEditCourse, isStudent } from "@/helpers/authorization";
import { getCreatedByIdFromCourse } from "@/helpers/course-hub";
import { useUser } from "@/hooks/useUser";
import { Skeleton } from "@/components/primitives";
import { operatorEnum } from "@/types/api";
import type { UserCourse } from "@/sdk";
import { useUserCoursesList } from "@/sdk/hooks/user-courses";
import Link from "next/link";
import { useMemo } from "react";

function userFromRow(row: UserCourse) {
  return typeof row.user === "object" && row.user ? row.user : null;
}

export default function CourseMembersPage() {
  const { user } = useUser();
  const {
    courseId,
    course,
    isCourseLoading,
    eventData,
    teacherMemberIds,
  } = useCourseHub();

  const canEditCourseDetails = Boolean(
    user &&
      course &&
      canEditCourse(user, teacherMemberIds, getCreatedByIdFromCourse(course)),
  );

  const filterParams = useMemo(
    () => [
      {
        field_name: "course_id",
        operator: operatorEnum.exact,
        value: courseId,
      },
      {
        field_name: "assigned_as",
        operator: operatorEnum.exact,
        value: "teacher",
      },
    ],
    [courseId],
  );

  const tableState = useResourceTableState({
    namespace: "getTeachersOfCourse",
    syncUrl: false,
  });
  const list = useUserCoursesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["user", "assigned_as_role"],
    teacher_roster_order: true,
    filterParams,
  });

  const hideProfileLink = Boolean(user && isStudent(user));
  const events = eventData?.data?.data;

  const columns: Column<UserCourse>[] = useMemo(() => {
    const cols: Column<UserCourse>[] = [
      column.text<UserCourse>({
        id: "user__name",
        header: "Name",
        accessor: (row) => userFromRow(row)?.name,
      }),
      column.text<UserCourse>({
        id: "user__email",
        header: "Email",
        accessor: (row) => userFromRow(row)?.email,
      }),
      column.text<UserCourse>({
        id: "assigned_as_role__name",
        header: "Role",
        accessor: (row) => row.assigned_as_role?.name,
      }),
      {
        id: "schedule",
        header: "Schedule",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const u = userFromRow(row);
          return (
            <CourseTeacherScheduleSheet
              courseId={courseId}
              userId={u?.id}
              events={events}
              personName={u?.name ?? undefined}
            />
          );
        },
      },
    ];
    if (!hideProfileLink) {
      cols.push({
        id: "open",
        header: "",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          const u = userFromRow(row);
          if (!u) return null;
          return (
            <Link
              href={`/users/${u.id}`}
              className="text-sm text-accent underline-offset-2 hover:underline"
            >
              Open
            </Link>
          );
        },
      });
    }
    return cols;
  }, [courseId, events, hideProfileLink]);

  if (isCourseLoading) {
    return <Skeleton className="min-h-[200px] w-full rounded-xl" aria-busy />;
  }

  if (!user) {
    return null;
  }

  if (!course.id) {
    return (
      <p className="text-sm text-text-secondary" role="alert">
        Course could not be loaded.
      </p>
    );
  }

  return (
    <PageContainer width={COURSE_HUB_PAGE_WIDTH} className={courseRecordTabStackClassName()}>
      <CourseTabEditBar
        showEdit={canEditCourseDetails}
        editHref={`/courses/${courseId}/edit?tab=edit-members`}
      />

      <CourseOversightTable
        courseId={courseId}
        hideProfileLink={hideProfileLink}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium uppercase tracking-wide text-text-muted">
            Staff
          </p>
          <ScheduleBadgeLegend variant="inline" />
        </div>
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={columns}
          getRowId={(row) => {
            const u = userFromRow(row);
            return u ? String(u.id) : String(row.id);
          }}
        />
      </div>
    </PageContainer>
  );
}
