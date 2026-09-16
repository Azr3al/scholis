"use client";

import { FinanceRecordRailProvider } from "@/components/finances/record/finance-record-rail-provider";
import type { ReactNode } from "react";

export default function PaymentMethodsLayout({ children }: { children: ReactNode }) {
  return <FinanceRecordRailProvider>{children}</FinanceRecordRailProvider>;
}
