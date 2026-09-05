"use client";

import "../shell-layout-styles.css";
import { InternalAppShell } from "@/components/shell/internal-app-shell";
import { PlatformAdminGate } from "@/hooks/usePlatformAdminGate";

export default function PlatformInternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlatformAdminGate>
      <InternalAppShell>{children}</InternalAppShell>
    </PlatformAdminGate>
  );
}
