"use client";

import { Suspense } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { IssuesView } from "@/components/issues/issues-view";
import { Skeleton } from "@/components/primitives";

export default function IssuesPage() {
  return (
    <PageContainer width="wide">
      <Suspense
        fallback={<Skeleton className="h-40 w-full rounded-xl" aria-busy="true" />}
      >
        <IssuesView />
      </Suspense>
    </PageContainer>
  );
}
