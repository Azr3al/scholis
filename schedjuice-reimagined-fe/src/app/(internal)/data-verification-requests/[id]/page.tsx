"use client";
import { buttonVariants, Skeleton } from "@/components/primitives";
import {
  adminCrudSurfaceBodyClassName,
  adminCrudSurfaceClassName,
  adminCrudSurfaceHeaderClassName,
} from "@/lib/ui-remediation/r8-admin-crud-layout-classes";

import { PageContainer } from "@/components/layout/page-container";
import { fetchEntity } from "@/app/client-api/utils";
import { DvrVerifyForm } from "@/components/dvr/dvr-verify-form";
import AuditDisplay from "@/components/misc/audit-display";
import BackButton from "@/components/misc/back-button";
import CopyInput from "@/components/misc/copy-input";
import { DVR_PREVIEW_STUB_USER } from "@/helpers/dvr";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

const DVRDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["get-dvr", id],
    queryFn: () => fetchEntity("data-verification-requests", id, ["created_by"]),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between">
          <BackButton href="/data-verification-requests" />
          <Skeleton className="h-10 w-16" />
        </div>
        <div className={adminCrudSurfaceClassName()}>
          <div className={adminCrudSurfaceHeaderClassName()}>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className={cn(adminCrudSurfaceBodyClassName(), "space-y-3")}>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.data?.data) {
    return (
      <div className="space-y-3">
        <BackButton href="/data-verification-requests" />
        <div className={adminCrudSurfaceClassName()}>
          <div className={cn(adminCrudSurfaceBodyClassName(), "p-6")}>
            <p className="text-destructive">
              Error loading data verification request. Please try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const dvrData = data.data.data;

  return (
    <PageContainer width="default" className="space-y-3">
      <div className="flex justify-between">
        <BackButton href="/data-verification-requests" />
        <Link
          className={cn(buttonVariants({ variant: "primary" }))}
          href={`/data-verification-requests/${id}/edit`}
        >
          Edit
        </Link>
      </div>
      <div className={adminCrudSurfaceClassName()}>
        <div className={adminCrudSurfaceHeaderClassName()}>
          <h2 className="font-semibold text-text-primary">
            {dvrData.name || "Untitled Request"}
          </h2>
          <AuditDisplay
            created_at={dvrData.created_at}
            updated_at={dvrData.updated_at}
            created_by={dvrData.created_by}
          />
        </div>
        <div className={cn(adminCrudSurfaceBodyClassName(), "space-y-3")}>
          {dvrData.expires_on ? (
            <p className="text-sm text-text-secondary">
              Expires on{" "}
              <span className="font-medium text-text-primary">
                {dvrData.expires_on}
              </span>
            </p>
          ) : null}
          <CopyInput
            description="Give this link to users to let them verify their data."
            label="DVR Link"
            text={`${window.location.origin}/data-verification-requests/${id}/verify`}
          />
          <div data-testid="dvr-preview">
            <DvrVerifyForm
              mode="preview"
              user={DVR_PREVIEW_STUB_USER}
              rawFields={dvrData.fields}
              title="Preview"
              description="This is what recipients will fill in."
            />
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default DVRDetailsPage;
