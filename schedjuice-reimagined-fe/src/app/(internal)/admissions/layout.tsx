"use client";

import { AdmissionsRecordRailProvider } from "@/components/admissions/record/admissions-record-rail-provider";
import type { ReactNode } from "react";

export default function AdmissionsLayout({ children }: { children: ReactNode }) {
  return (
    <AdmissionsRecordRailProvider>{children}</AdmissionsRecordRailProvider>
  );
}
