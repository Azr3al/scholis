"use client";

import { PageContainer } from "@/components/layout/page-container";
import { TypographyH1 } from "@/components/typography/h1";
import { CampusCheckinButton } from "@/components/campus-checkin/campus-checkin-button";

export default function CampusCheckinPage() {
  return (
    <PageContainer width="narrow" className="space-y-6">
      <TypographyH1>Campus Check-in</TypographyH1>
      <p className="text-text-muted text-sm">
        Check in once when you arrive and check out when you leave.
      </p>
      <CampusCheckinButton />
    </PageContainer>
  );
}
