import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageSection({
  children,
  className,
  dominant = false,
}: {
  children: ReactNode;
  className?: string;
  /** Dominant region — table or primary workflow surface. */
  dominant?: boolean;
}) {
  return (
    <section
      className={cn("min-w-0", dominant && "flex-1", className)}
      data-slot={dominant ? "page-section-dominant" : "page-section"}
    >
      {children}
    </section>
  );
}
