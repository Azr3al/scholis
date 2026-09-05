"use client";

import { FinanceRecordRailProvider } from "@/components/finances/record/finance-record-rail-provider";
import { FinanceLayoutHeader } from "@/components/finances/record/use-finance-record-page-header";
import type { ReactNode } from "react";

export default function FinancesLayout({ children }: { children: ReactNode }) {
  return (
    <FinanceRecordRailProvider>
      <FinanceLayoutHeader />
      {children}
    </FinanceRecordRailProvider>
  );
}
