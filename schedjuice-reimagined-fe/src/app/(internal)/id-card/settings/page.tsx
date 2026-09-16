"use client";

import { PageContainer } from "@/components/layout/page-container";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/primitives";

export default function IdCardSettingsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/organizations/profile?section=id-cards");
  }, [router]);

  return (
    <PageContainer width="default">
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    </PageContainer>
  );
}
