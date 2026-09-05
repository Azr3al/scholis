"use client";

import { buttonVariants, Skeleton } from "@/components/primitives";
import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import {
  adminCrudDetailSectionClassName,
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const AssignedAsRoleDetailsPage = () => {
  const { id } = useParams<{ id: string }>();

  const getAssignedAsRole = useQuery({
    queryKey: ["getAssignedAsRole", id],
    queryFn: () => fetchEntity("assigned-as-roles", id),
  });

  return (
    <PageContainer
      width="default"
      className={adminCrudDetailSectionClassName()}
    >
      <div className="flex justify-between">
        <Link
          href="/course-roles"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "size-9 p-0",
          )}
          aria-label="Back to course roles"
        >
          <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        </Link>
        <Link
          href={`/course-roles/${id}/edit`}
          className={cn(buttonVariants({ variant: "primary" }))}
        >
          Edit
        </Link>
      </div>
      {getAssignedAsRole.isLoading || getAssignedAsRole.isFetching ? (
        <div className={adminCrudSurfaceClassName()} aria-busy="true">
          <div className={adminCrudSurfaceHeaderClassName()}>
            <Skeleton className="h-6 w-48" />
          </div>
          <div className={adminCrudSurfaceBodyClassName()}>
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      ) : (
        <div className={adminCrudSurfaceClassName()}>
          <div className={adminCrudSurfaceHeaderClassName()}>
            <h2 className="font-semibold text-text-primary">
              {getAssignedAsRole.data?.data.data.name}
            </h2>
          </div>
          <div className={adminCrudSurfaceBodyClassName()}>
            <p className="text-sm text-text-secondary">
              Is Collision Enabled:{" "}
              {getAssignedAsRole.data?.data.data.is_collision_enabled.toString()}
            </p>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default AssignedAsRoleDetailsPage;
