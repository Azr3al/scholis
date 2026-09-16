"use client";

import { Spinner } from "@/components/primitives/spinner";
import { PageContainer } from "@/components/layout/page-container";
import { canAccessDemoGuide } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

export function DemoGuideGate({ children }: { children: ReactNode }) {
  const { user, isLoading: userLoading } = useUser();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const router = useRouter();

  const allowed = canAccessDemoGuide(user, tenant);
  const isLoading = userLoading || tenantLoading;

  useEffect(() => {
    if (!isLoading && !allowed) {
      router.replace("/home");
    }
  }, [allowed, isLoading, router]);

  if (isLoading || !allowed) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Spinner className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

export function DemoGuidePageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <DemoGuideGate>
      <PageContainer width="default" className="min-h-[70vh]">
        <div className="border-b border-border pb-4 mb-6">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </PageContainer>
    </DemoGuideGate>
  );
}
