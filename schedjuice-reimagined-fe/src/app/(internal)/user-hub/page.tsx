"use client";

import { PageContainer } from "@/components/layout/page-container";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function UserHubRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/users${qs ? `?${qs}` : ""}`);
  }, [router, searchParams]);

  return (
    <div className="mt-3 text-sm text-text-muted">Loading…</div>
  );
}

export default function UserHubRedirect() {
  return (
    <PageContainer width="wide">
      <Suspense
        fallback={
          <div className="mt-3 text-sm text-text-muted">Loading…</div>
        }
      >
        <UserHubRedirectInner />
      </Suspense>
    </PageContainer>
  );
}
