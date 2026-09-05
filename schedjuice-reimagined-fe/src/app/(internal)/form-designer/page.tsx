"use client";

import { FormDesigner } from "@/components/custom-fields/designer/form-designer";
import { PageContainer } from "@/components/layout/page-container";
import { TypographyH1 } from "@/components/typography/h1";
import { hasAdminCredentials } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function FormDesignerPage() {
  const { user: account } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (account && !hasAdminCredentials(account)) router.replace("/");
  }, [account, router]);

  if (!account || !hasAdminCredentials(account)) return null;

  return (
    <PageContainer className="space-y-6 px-4 py-6">
      <TypographyH1>Form designer</TypographyH1>
      <p className="text-sm text-text-muted">
        Organize the fields people fill in, set when each is required and who
        fills it, and preview exactly what staff and members see.
      </p>
      <FormDesigner />
    </PageContainer>
  );
}
