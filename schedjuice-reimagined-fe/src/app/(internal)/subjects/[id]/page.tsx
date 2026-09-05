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
import { subjectType } from "@/types/subject";
import { useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useParams } from "next/navigation";

const SubjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["getSubject", id],
    queryFn: () => fetchEntity("subjects", id),
  });
  const subject = data?.data?.data as subjectType | undefined;

  return (
    <PageContainer width="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/subjects"
          className={cn(buttonVariants({ variant: "ghost", size: "sm"  }), "size-9 p-0")}
          aria-label="Back"
        >
          <NavArrowLeft width={16} height={16} aria-hidden />
        </Link>
        <Link
            href={`/subjects/${id}/edit`}
            className={cn(buttonVariants({ variant: "primary", size: "sm"  }))}
          >
            Edit
          </Link>
      </div>
      {isLoading || isFetching || !subject ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className={adminCrudSurfaceClassName()}>
          <div className={adminCrudSurfaceHeaderClassName()}>
            <h2 className="font-semibold text-text-primary">{subject.name}</h2>
            <div className="text-sm text-text-muted">
              {subject.description?.trim() || "No description provided."}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default SubjectDetailPage;
