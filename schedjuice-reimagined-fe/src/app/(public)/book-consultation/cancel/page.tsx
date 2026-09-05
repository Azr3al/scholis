"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Loader } from "@/components/form/loader";
import { PageContainer } from "@/components/layout/page-container";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/public/elevated-card";
import {
  globalRoutePageWidth,
  resolveGlobalRouteLayout,
} from "@/lib/ui-remediation/r6-global-route-classes";

const PAGE_WIDTH = globalRoutePageWidth(
  resolveGlobalRouteLayout("/(public)/book-consultation/cancel"),
);

function CancelRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      router.replace(`/book-consultation/booking?token=${encodeURIComponent(token)}`);
    }
  }, [router, token]);

  return (
    <PageContainer width={PAGE_WIDTH} className="py-10 max-sm:py-5">
      <Card>
        <CardHeader>
          <CardTitle>Your consultation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Loader />
            <p className="text-sm text-text-secondary">Loading…</p>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

export default function BookConsultationCancelPage() {
  return (
    <Suspense fallback={null}>
      <CancelRedirect />
    </Suspense>
  );
}
