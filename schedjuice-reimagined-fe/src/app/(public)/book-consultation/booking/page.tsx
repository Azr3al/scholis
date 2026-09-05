"use client";

import { PublicBookingManageView } from "@/components/consultation/public/public-booking-manage-view";
import { Suspense } from "react";
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
  resolveGlobalRouteLayout("/(public)/book-consultation/booking"),
);

function BookingPageFallback() {
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

export default function BookConsultationBookingPage() {
  return (
    <Suspense fallback={<BookingPageFallback />}>
      <PublicBookingManageView />
    </Suspense>
  );
}
