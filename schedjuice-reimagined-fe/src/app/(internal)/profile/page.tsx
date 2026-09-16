"use client";

import { PageContainer } from "@/components/layout/page-container";
import { usePageHeader } from "@/components/shell/use-page-header";
import { RecordPageSkeleton } from "@/components/record/record-page-skeleton";
import { useUser } from "@/hooks/useUser";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(internal)/profile"),
);

const UserProfilePage = () => {
  const { user, isLoading } = useUser();
  const router = useRouter();

  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">Profile</h1>
        ),
        toolbarSecondary: (
          <p className="text-sm text-text-muted">Opening your profile…</p>
        ),
      }),
      [],
    ),
  );

  useEffect(() => {
    if (isLoading) return;
    const userId = user?.id;
    if (typeof userId === "number" && Number.isFinite(userId)) {
      router.replace(`/users/${userId}`);
    }
  }, [user, isLoading, router]);

  return (
    <PageContainer width={PAGE_WIDTH}>
      <RecordPageSkeleton />
    </PageContainer>
  );
};

export default UserProfilePage;
