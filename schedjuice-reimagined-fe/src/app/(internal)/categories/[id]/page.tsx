"use client";
import { Separator, Skeleton, buttonVariants } from "@/components/primitives";
import {
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { cn } from "@/lib/utils";
import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { courseColumns } from "@/app/(internal)/courses/course-columns";
import { hasAdminCredentials } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { useCoursesList } from "@/sdk/hooks/courses";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const CategoryDetailsPage: React.FC = () => {
  const { id } = useParams<{id: string}>();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["getCategory", id],
    queryFn: () => fetchEntity("categories", id),
  });
  const { user } = useUser();
  const { tenant } = useTenant();
  const isMsEnabled = Boolean(
    tenant?.is_microsoft_on && tenant?.is_teams_creation_enabled,
  );

  const categoryFilter = useMemo(
    () => [
      { field_name: "category", value: id, operator: operatorEnum.exact },
    ],
    [id],
  );

  const coursesTableState = useResourceTableState({
    namespace: `courses-of-category-${id}`,
    syncUrl: false,
  });
  const coursesList = useCoursesList({
    page: coursesTableState.page,
    pageSize: coursesTableState.pageSize,
    sorts: coursesTableState.sorts,
    q: coursesTableState.q,
    filterParams: categoryFilter,
  });

  return (
    <PageContainer width="default" className="space-y-3">
      <div className="flex justify-between items-center">
      <Link
          href={"/categories"}
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
      {user && hasAdminCredentials(user) &&
      <Link
            href={`/categories/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Edit
          </Link>}
      </div>
      {isLoading || isFetching ? (
        <div className="space-y-3" aria-busy="true">
          <div className={adminCrudSurfaceClassName()}>
            <div className={cn(adminCrudSurfaceHeaderClassName(), "space-y-2")}>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full max-w-md" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          <Separator></Separator>
          <Skeleton className="h-6 w-24" />
          <TableSkeleton columns={4} rows={5} />
        </div>
      ) : (
        <>
          <div className={adminCrudSurfaceClassName()}>
            <div className={adminCrudSurfaceHeaderClassName()}>
              <h2 className="font-semibold text-text-primary">{data?.data.data.name}</h2>
              <div className="text-sm text-text-muted">{data?.data.data.description}</div>
              {isMsEnabled && (
                <p className="text-sm text-text-secondary mt-2">
                  Payment assignment eligible: {data?.data.data.is_payment_assignment_eligible ? "Yes" : "No"}
                </p>
              )}
            </div>
          </div>
          <Separator></Separator>
          <h2>Courses</h2>
          <ResourceTable
            list={coursesList}
            tableState={coursesTableState}
            columns={courseColumns}
            getRowId={(row) => String(row.id)}
            rowHref={(row) => `/courses/${row.id}`}
          />
        </>
      )}
    </PageContainer>
  );
};

export default CategoryDetailsPage;
