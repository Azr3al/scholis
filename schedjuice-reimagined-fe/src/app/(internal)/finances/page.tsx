"use client";

import { PageContainer } from "@/components/layout/page-container";
import { FinanceHomepageContent } from "@/components/finances/finance-homepage-content";

export default function FinanceHomePage() {
  return (
    <PageContainer width="wide">
      <FinanceHomepageContent />
    </PageContainer>
  );
}
