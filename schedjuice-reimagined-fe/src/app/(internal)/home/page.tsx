"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { HomePage } from "@/components/home/home-page";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useMemo } from "react";

export default function HomePageRoute() {
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
    <PageContainer width="narrow">
      <PageSection dominant>
        <HomePage />
      </PageSection>
    </PageContainer>
  );
}
