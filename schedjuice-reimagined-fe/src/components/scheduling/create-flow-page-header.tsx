"use client";

import { usePageHeader } from "@/components/shell/use-page-header";
import { useMemo } from "react";

export function CreateFlowPageHeader() {
  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <p className="truncate font-serif text-lg text-text-primary">Add classes</p>
      ),
    }),
    [],
  );

  usePageHeader(headerConfig);

  return null;
}
