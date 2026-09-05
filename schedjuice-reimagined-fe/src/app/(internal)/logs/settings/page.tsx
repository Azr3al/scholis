"use client";

import { PageContainer } from "@/components/layout/page-container";
import { ReportTypeConfig } from "@/components/user-logs/report-type-config";
import { TypographyH1 } from "@/components/typography/h1";
import { Skeleton } from "@/components/primitives";
import { permissionsFor } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LogSettingsPage() {
  const { user, isLoading: userLoading } = useUser();
  const router = useRouter();
  const canConfigure = user
    ? permissionsFor(user).can("userlog.configure")
    : false;

  useEffect(() => {
    if (!userLoading && user && !canConfigure) {
      router.replace("/logs");
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
        href="/logs"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <NavArrowLeft className="size-4 shrink-0" aria-hidden />
        Logs
      </Link>
      <TypographyH1>Report types</TypographyH1>
      <ReportTypeConfig />
    </PageContainer>
  );
}
