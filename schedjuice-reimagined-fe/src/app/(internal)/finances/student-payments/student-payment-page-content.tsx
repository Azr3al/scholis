"use client";

import { StudentPaymentsReport } from "@/components/finances/student-payments-report";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";

export default function StudentPaymentPage() {
  useFinancePageHeader();

  return <StudentPaymentsReport />;
}
