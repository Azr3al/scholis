"use client";

import { Spinner } from "@/components/primitives/spinner";
import { useEffect, useState } from "react";

import { DemoScriptSection } from "@/app/(platform-internal)/internal/demo-artifacts/_components/demo-script-section";
import { fetchDemoGuide } from "@/lib/demo-artifacts-api";
import type { BriefDetail } from "@/types/demo-artifacts";

import { DemoGuidePageShell } from "./_components/demo-guide-shell";

export default function DemoGuidePage() {
  const [detail, setDetail] = useState<BriefDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDemoGuide()
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <DemoGuidePageShell title="Demo Guide">
        <p className="text-destructive text-sm">{error}</p>
      </DemoGuidePageShell>
    );
  }

  if (!detail) {
    return (
      <DemoGuidePageShell title="Demo Guide">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </DemoGuidePageShell>
    );
  }

  const demoDate = detail.summary.demo_date;

  return (
    <DemoGuidePageShell
      title={detail.summary.school_name}
      description={
        demoDate
          ? `Follow these stops during your demo (${demoDate}). Links open in this tenant.`
          : "Follow these stops during your demo. Links open in this tenant."
      }
    >
      <DemoScriptSection detail={detail} />
    </DemoGuidePageShell>
  );
}
