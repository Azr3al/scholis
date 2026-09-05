"use client";

import { PageContainer } from "@/components/layout/page-container";
import { CrmSettingsPanel } from "@/components/leads/crm-settings-panel";
import { TypographyH1 } from "@/components/typography/h1";
import { Skeleton } from "@/components/primitives";
import { permissionsFor } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CrmSettingsPage() {
  const { user, isLoading: userLoading } = useUser();
  const router = useRouter();
  const canConfigure = user ? permissionsFor(user).can("crm.configure") : false;

  useEffect(() => {
    if (!userLoading && user && !canConfigure) {
      router.replace("/crm/leads");
    }
  }, [userLoading, user, canConfigure, router]);

  if (userLoading || (user && !canConfigure)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  return (
    <PageContainer width="wide" className="flex flex-col gap-6">
      <Link
        href="/crm/leads"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Leads
      </Link>

      <div className="flex flex-col gap-1">
        <TypographyH1>CRM settings</TypographyH1>
        <p className="max-w-[65ch] text-sm leading-relaxed text-text-secondary">
          Manage lead statuses and inquiry sources. Changes apply immediately on
          the leads board.
        </p>
      </div>

      <CrmSettingsPanel />
    </PageContainer>
  );
}
