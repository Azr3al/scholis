"use client";
import { cn } from "@/lib/utils";
import {
  adminCrudDetailSectionClassName,
  adminCrudStatusBadgeClassName,
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { Separator, Skeleton, buttonVariants } from "@/components/primitives";

import { intakeColumns } from "@/app/(internal)/intakes/intake-columns";
import { courseColumns } from "@/app/(internal)/courses/course-columns";
import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { operatorEnum } from "@/types/api";
import { subjectStrategyLabel } from "@/helpers/subject-strategy-labels";
import {
  CourseCreationMethod,
  programType,
} from "@/types/program";
import { useIntakesList } from "@/sdk/hooks/intakes";
import { useCoursesList } from "@/sdk/hooks/courses";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft, Settings } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

function formatCreationMethod(method: CourseCreationMethod): string {
  return method === CourseCreationMethod.intake_based
    ? "Intake-based"
    : "Manual";
}

const ProgramDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["getProgramDetail", id],
    queryFn: () => fetchEntity("programs", id),
  });
  const program = data?.data?.data as programType | undefined;

  const programFilter = useMemo(
    () => [
      {
        field_name: "program",
        operator: operatorEnum.exact,
        value: id,
      },
    ],
    [id],
  );

  const intakesTableState = useResourceTableState({
    namespace: `program-${id}-intakes`,
    syncUrl: false,
  });
  const intakesList = useIntakesList({
    page: intakesTableState.page,
    pageSize: intakesTableState.pageSize,
    sorts: intakesTableState.sorts,
    q: intakesTableState.q,
    filterParams: programFilter,
  });

  const coursesTableState = useResourceTableState({
    namespace: `program-${id}-courses`,
    syncUrl: false,
  });
  const coursesList = useCoursesList({
    page: coursesTableState.page,
    pageSize: coursesTableState.pageSize,
    sorts: coursesTableState.sorts,
    q: coursesTableState.q,
    filterParams: programFilter,
  });

  if (isLoading || !program) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <PageContainer width="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/programs"
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/programs/${id}/settings`}
            className={cn(buttonVariants({ variant: "secondary", size: "sm"  }))}
          >
            <Settings className="mr-2 h-4 w-4" />
              Settings
          </Link>
          <Link
            href={`/programs/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "sm"  }))}
          >
            Edit
          </Link>
        </div>
      </div>

      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-text-primary">{program.name}</h2>
            {program.is_default ? <span className={cn(adminCrudStatusBadgeClassName("secondary"))}>Default</span> : null}
            {program.is_protected ? (
              <span className={cn(adminCrudStatusBadgeClassName("outline"))}>Protected</span>
            ) : null}
            {program.is_active === false ? (
              <span className={cn(adminCrudStatusBadgeClassName("destructive"))}>Inactive</span>
            ) : (
              <span className={cn(adminCrudStatusBadgeClassName("outline"))}>Active</span>
            )}
          </div>
          {program.description ? (
            <div className={cn("text-sm text-text-muted", "mt-2")}>{program.description}</div>
          ) : null}
          <p className="mt-3 text-sm text-text-secondary">
            Creation: {formatCreationMethod(program.course_creation_method)} ·
            Subjects: {subjectStrategyLabel(program.subject_strategy)}
          </p>
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="mb-2 text-lg font-medium">Intakes</h2>
        <ResourceTable
          list={intakesList}
          tableState={intakesTableState}
          columns={intakeColumns}
          getRowId={(row) => String(row.id)}
          rowHref={(row) => `/intakes/${row.id}`}
        />
      </div>

      <Separator />

      <div>
        <h2 className="mb-2 text-lg font-medium">Courses</h2>
        <ResourceTable
          list={coursesList}
          tableState={coursesTableState}
          columns={courseColumns}
          getRowId={(row) => String(row.id)}
          rowHref={(row) => `/courses/${row.id}`}
        />
      </div>
    </PageContainer>
  );
};

export default ProgramDetailPage;
