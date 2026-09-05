"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { usePageHeader } from "@/components/shell/use-page-header";
import { HomeDashboard } from "@/components/home/home-dashboard";
import { useMemo } from "react";

export default function HomePage() {
  usePageHeader(
    useMemo(
      () => ({
        breadcrumb: (
          <h1 className="font-serif text-lg text-text-primary">Home</h1>
        ),
      }),
      [],
    ),
  );

  return (
    <PageContainer width="default">
      <PageSection dominant>
        <HomeDashboard />
      </PageSection>
    </PageContainer>
  );
}
