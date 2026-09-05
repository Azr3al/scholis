"use client";

import { StudioRecordRailProvider } from "@/components/studio/record/studio-record-rail-provider";
import type { ReactNode } from "react";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioRecordRailProvider>{children}</StudioRecordRailProvider>;
}
