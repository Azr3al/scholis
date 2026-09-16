"use client";

import { PageContainer } from "@/components/layout/page-container";
import { useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";

function CustomFieldDefinitionsRedirectInner() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/form-designer");
  }, [router]);

  return (
    <div className="mt-3 text-sm text-text-muted">Loading…</div>
  );
}

export default function CustomFieldDefinitionsRedirect() {
  return (
    <PageContainer width="default">
      <Suspense
        fallback={
          <div className="mt-3 text-sm text-text-muted">Loading…</div>
        }
      >
        <CustomFieldDefinitionsRedirectInner />
      </Suspense>
    </PageContainer>
  );
}
