"use client";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import BackButton from "@/components/misc/back-button";
import { Skeleton } from "@/components/primitives";
import {
  adminCrudDetailSectionClassName,
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

const CampusDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["getCampus", id],
    queryFn: () => fetchEntity("campuses", id),
  });

  return (
    <PageContainer
      width="default"
      className={adminCrudDetailSectionClassName()}
    >
      <div className="flex items-center justify-between">
        <BackButton href="/campuses" />
      </div>
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">
            {isLoading ? <Skeleton className="h-8 w-64" /> : data?.data.data.name}
          </h2>
        </div>
        <div className={adminCrudSurfaceBodyClassName()}>
          <p className="text-sm text-text-secondary">
            {isLoading ? (
              <Skeleton className="h-5 w-full" />
            ) : (
              data?.data.data.description
            )}
          </p>
        </div>
      </div>
    </PageContainer>
  );
};

export default CampusDetailsPage;
