"use client";

import { StudioRecordRailProvider } from "@/components/studio/record/studio-record-rail-provider";
import type { ReactNode } from "react";

export default function AwardTitlesLayout({ children }: { children: ReactNode }) {
  return <StudioRecordRailProvider>{children}</StudioRecordRailProvider>;
}
