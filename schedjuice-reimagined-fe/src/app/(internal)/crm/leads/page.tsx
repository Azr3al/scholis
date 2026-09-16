"use client";

import { PageContainer } from "@/components/layout/page-container";
import { LeadsView } from "@/components/leads/leads-view";

export default function LeadsPage() {
  return (
    <PageContainer width="wide">
      <LeadsView />
    </PageContainer>
  );
}
