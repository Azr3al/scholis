"use client";

import Link from "next/link";
import { PageContainer } from "@/components/layout/page-container";
import { ComplaintList } from "@/components/complaints/complaint-list";
import { usePageHeader } from "@/components/shell/use-page-header";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { Plus } from "iconoir-react";
import { useMemo } from "react";

export default function ComplaintsPage() {
  const headerConfig = useMemo(
    () => ({
      toolbarSecondary: (
        <p className="text-sm text-text-muted">
          Messages between your parent and school staff
        </p>
      ),
      actions: (
        <Link
          href="/complaints/new"
          className={cn(buttonVariants({ variant: "primary", size: "sm" }), "gap-2")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          New complaint
        </Link>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer className="w-full min-w-0 space-y-6">
      <ComplaintList />
    </PageContainer>
  );
}
