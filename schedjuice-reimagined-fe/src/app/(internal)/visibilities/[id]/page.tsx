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
import { formatDateTime } from "@/helpers/date";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

const VisibilityDetailsPage: React.FC = () => {
  const { id } = useParams<{id: string}>();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["getVisibility", id],
    queryFn: () => fetchEntity("visibilities", id, ["created_by"]),
  });
  return (
    <PageContainer width="default">
      {isLoading || isFetching ? (
        <div className="space-y-3" aria-busy="true">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-10 w-16" />
          </div>
          <div className={adminCrudSurfaceClassName()}>
            <div className={adminCrudSurfaceHeaderClassName()}>
              <Skeleton className="h-6 w-44" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <div className={cn(adminCrudSurfaceBodyClassName(), "space-y-3")}>
              <Skeleton className="h-5 w-64" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
      <div className="flex items-center justify-between">
        <BackButton href="/visibilities"></BackButton>
        <Link
            href={`/visibilities/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "md"  }))}
          >
            Edit
          </Link>
      </div>
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">Visibility Details</h2>
          <div className="text-sm text-text-muted">
            <p>Created At: {formatDateTime(data?.data.data.created_at)}</p>
            <p>Updated At: {formatDateTime(data?.data.data.updated_at)}</p>
            <p>Created By: {data?.data.data.created_by.name}</p>
          </div>
        </div>
        <div className={adminCrudSurfaceBodyClassName()}>
          <p>
            <span className=" font-bold">Name: </span> {data?.data.data.name}
          </p>
          <div className="flex items-center gap-3">

            <span className=" font-bold">Role: </span>{" "}
            <span className={adminCrudStatusBadgeClassName()}>{data?.data.data.role}</span>
          </div>



        </div>
      </div>
        </div>
      )}
    </PageContainer>
  );
};

export default VisibilityDetailsPage;
