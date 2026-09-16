"use client";

import { PageContainer } from "@/components/layout/page-container";
import { StudentPaymentsReport } from "@/components/finances/student-payments-report";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { Skeleton } from "@/components/primitives";
import { safeBackHref } from "@/helpers/student-payments-transaction-lookup";
import { ArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function TransactionLookupInner() {
  const searchParams = useSearchParams();
  const backHref =
    safeBackHref(searchParams.get("backHref") ?? searchParams.get("returnTo")) ??
    "/finances/student-payments";

  useFinancePageHeader();

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          Student payments
        </Link>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Finds payments by transaction ID across all courses and billing
          months. Scoped filters on the main student payments report do not
          apply here.
        </p>
      </div>
      <StudentPaymentsReport globalTransactionLookup />
    </div>
  );
}

export default function StudentPaymentsTransactionLookupPage() {
  return (
    <PageContainer width="wide">
      <Suspense
        fallback={<Skeleton className="mx-auto h-40 max-w-5xl rounded-xl" />}
      >
        <TransactionLookupInner />
      </Suspense>
    </PageContainer>
  );
}
