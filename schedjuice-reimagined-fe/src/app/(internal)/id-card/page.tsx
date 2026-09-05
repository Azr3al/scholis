"use client";

import Link from "next/link";
import { Settings } from "iconoir-react";
import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants, Skeleton } from "@/components/primitives";
import { IdCardStage } from "@/components/id-card/id-card-stage";
import { IdCardActions } from "@/components/id-card/id-card-actions";
import { useIdCard } from "@/components/id-card/use-id-card";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";

export default function IdCardPage() {
  const { vm, qrDataUrl, isLoading, isError } = useIdCard();
  const { can } = usePermissions();
  const canConfigure = can("org.configure");

  return (
    <PageContainer>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              My ID card
            </h1>
            <p className="text-sm text-text-secondary">
              Move your cursor over the badge to tilt it.
            </p>
          </div>
          {canConfigure ? (
            <Link
              href="/organizations/profile?section=id-cards"
              className={cn(
                buttonVariants({ variant: "secondary", size: "md"  }),
                "gap-2",
              )}
            >
              <Settings className="size-4" aria-hidden />
              Customize branding
            </Link>
          ) : null}
        </div>

        <div className="relative min-h-[28rem] overflow-hidden rounded-2xl border border-border bg-surface-hover">
          <IdCardContent
            vm={vm}
            qrDataUrl={qrDataUrl}
            isLoading={isLoading}
            isError={isError}
          />
        </div>

        {vm ? (
          <div className="flex justify-center">
            <IdCardActions vm={vm} qrDataUrl={qrDataUrl} />
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}

type ContentProps = {
  vm: ReturnType<typeof useIdCard>["vm"];
  qrDataUrl: string;
  isLoading: boolean;
  isError: boolean;
};

function IdCardContent({ vm, qrDataUrl, isLoading, isError }: ContentProps) {
  if (isLoading) {
    return (
      <div
        className="flex h-full min-h-[28rem] items-center justify-center"
        aria-busy
      >
        <Skeleton className="h-[480px] w-[300px] rounded-2xl" />
      </div>
    );
  }
  if (isError || !vm) {
    return (
      <div className="flex h-full min-h-[28rem] items-center justify-center p-6 text-center">
        <p className="text-sm text-text-muted">
          We couldn&apos;t load your ID card. Try again.
        </p>
      </div>
    );
  }
  return <IdCardStage vm={vm} qrDataUrl={qrDataUrl} />;
}
