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
import BackButton from "@/components/misc/back-button";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { userDepartmentColumns } from "@/app/(internal)/(department)/departments/user-department-columns";
import { hasAdminCredentials } from "@/helpers/authorization";
import { formatDateTime } from "@/helpers/date";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { useUserDepartmentsList } from "@/sdk/hooks/user-departments";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useMemo } from "react";

const DepartmentDetailsPage = () => {
  const pathname = usePathname();
  const { id } = useParams<{id: string}>();
  const { user } = useUser();
  const getDepartment = useQuery({
    queryKey: ["getDepartment", id],
    queryFn: () => {
      return fetchEntity("departments", id);
    },
  });

  const filterParams = useMemo(
    () => [
      {
        field_name: "department_id",
        operator: operatorEnum.exact,
        value: String(id),
      },
    ],
    [id],
  );

  const tableState = useResourceTableState({
    namespace: `user-departments-${id}`,
    syncUrl: false,
  });
  const list = useUserDepartmentsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["job", "user"],
    filterParams,
  });

  return (
    <PageContainer width="default" className="space-y-3">
      <div className="flex justify-between items-center">
        <BackButton href="/departments"></BackButton>
        {user && hasAdminCredentials(user) && (
          <Link
            href={`${pathname}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Edit
          </Link>
        )}
      </div>
      {getDepartment.isLoading ? (
        <div>
          <Skeleton className="w-full  h-36"></Skeleton>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={adminCrudSurfaceClassName()}>
            <div className={adminCrudSurfaceHeaderClassName()}>
              <h2 className="font-semibold text-text-primary">{getDepartment.data?.data.data.name}</h2>
              <div className="text-sm text-text-muted">
                <p>
                  Created At:{" "}
                  {formatDateTime(getDepartment.data?.data.data.created_at)}
                </p>
                <p>
                  Updated At:{" "}
                  {formatDateTime(getDepartment.data?.data.data.updated_at)}
                </p>
              </div>
            </div>
            <div className={adminCrudSurfaceBodyClassName()}>
              <p>Description: {getDepartment.data?.data.data.description}</p>
            </div>
          </div>
          <ResourceTable
            list={list}
            tableState={tableState}
            columns={userDepartmentColumns}
            getRowId={(row) => String(row.id)}
          />
        </div>
      )}
    </PageContainer>
  );
};

export default DepartmentDetailsPage;
