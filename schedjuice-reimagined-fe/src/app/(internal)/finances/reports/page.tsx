"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { useTenant } from "@/hooks/useTenant";
import { getTenantReportLinks } from "@/lib/reports/tenant-report-links";
import { NavArrowRight } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

const ReportsPage = () => {
  const router = useRouter();
  const { tenant } = useTenant();
  const reportLinks = useMemo(
    () => getTenantReportLinks(tenant),
    [tenant],
  );

  useFinancePageHeader();

  useEffect(() => {
    if (reportLinks.length === 1) {
      router.replace(reportLinks[0].href);
    }
  }, [reportLinks, router]);

  if (reportLinks.length === 1) {
    return null;
  }

  return (
    <PageContainer width="wide" className="flex flex-col gap-3">
      <PageSection dominant>
        <div className="flex flex-col gap-4">
          {reportLinks.map((report) => (
            <Link
              key={report.href}
              href={report.href}
              className="flex items-center gap-3 text-text-primary underline"
            >
              {report.label} <NavArrowRight />
            </Link>
          ))}
        </div>
      </PageSection>
    </PageContainer>
  );
};

export default ReportsPage;
