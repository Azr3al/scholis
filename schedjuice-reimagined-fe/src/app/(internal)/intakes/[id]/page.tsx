"use client";
import { cn } from "@/lib/utils";
import {
  adminCrudDetailSectionClassName,
  adminCrudStatusBadgeClassName,
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { Skeleton, buttonVariants } from "@/components/primitives";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import {
  ResourceTable,
  column,
  useResourceTableState,
  type Column,
} from "@/components/data-table";
import { formatDate } from "@/helpers/date";
import { courseDatesDifferFromIntake } from "@/helpers/intake-course-dates";
import { operatorEnum } from "@/types/api";
import { intakeType } from "@/types/intake";
import type { Course } from "@/sdk";
import { useCoursesList } from "@/sdk/hooks/courses";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const IntakeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["intake", id],
    queryFn: () => fetchEntity("intakes", id, ["program"]),
  });
  const intake = data?.data?.data as intakeType | undefined;
  const programName =
    intake && typeof intake.program === "object"
      ? intake.program.name
      : null;

  const tableState = useResourceTableState({
    namespace: `intake-${id}-courses`,
    syncUrl: false,
  });
  const filterParams = useMemo(
    () => [
      {
        field_name: "intake",
        operator: operatorEnum.exact,
        value: id,
      },
    ],
    [id],
  );
  const list = useCoursesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["intake"],
    filterParams,
  });

  const intakeCourseColumns: Column<Course>[] = useMemo(
    () => [
      column.text<Course>({
        id: "title",
        header: "Course Title",
        accessor: (row) => row.title,
      }),
      {
        id: "course_dates",
        header: "Course dates",
        accessor: (row) => row.start_date,
        cell: ({ row }) => {
          const course = row;
          const intakeDates =
            typeof course.intake === "object" && course.intake
              ? course.intake
              : {
                  start_date: intake?.start_date,
                  end_date: intake?.end_date,
                };
          const differs = courseDatesDifferFromIntake(
            {
              start_date: course.start_date,
              end_date: course.end_date,
            },
            intakeDates,
          );
          return (
            <div className="space-y-1">
              <span>
                {formatDate(course.start_date ?? "")} –{" "}
                {formatDate(course.end_date ?? "")}
              </span>
              {differs ? (
                <span className={cn(adminCrudStatusBadgeClassName("outline"), "text-xs")}>
                  Differs from intake
                </span>
              ) : null}
            </div>
          );
        },
      },
      column.text<Course>({
        id: "status",
        header: "Status",
        accessor: (row) => row.status,
      }),
    ],
    [intake?.start_date, intake?.end_date],
  );

  if (isLoading || !intake) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <PageContainer width="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/intakes"
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
        <Link
            href={`/intakes/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "sm"  }))}
          >
            Edit
          </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{intake.name}</h1>
        <p className="text-text-secondary text-sm">
          {programName && <>Program: {programName} · </>}
          {formatDate(intake.start_date)} – {formatDate(intake.end_date)}
        </p>
      </div>
      <div>
        <h2 className="text-lg font-medium mb-2">Courses in this intake</h2>
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={intakeCourseColumns}
          getRowId={(row) => String(row.id)}
          rowHref={(row) => `/courses/${row.id}`}
        />
      </div>
    </PageContainer>
  );
};

export default IntakeDetailPage;
