"use client";

import { DvrCreateDesigner } from "@/components/dvr/dvr-create-designer";
import { PageContainer } from "@/components/layout/page-container";

export default function DVRCreatePage() {
  return (
    <PageContainer width="wide" className="space-y-3 border-x-0">
      <DvrCreateDesigner />
    </PageContainer>
  );
}
