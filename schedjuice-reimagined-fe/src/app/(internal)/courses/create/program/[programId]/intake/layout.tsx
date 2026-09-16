"use client";

import { CreateFlowLoading } from "@/components/scheduling/create-flow-loading";
import {
  getRedirectStepForInvalidRoute,
  intakeStepPath,
} from "@/components/scheduling/intake/intake-steps";
import { useIntakeFlow } from "@/components/scheduling/intake/use-intake-flow";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

function stepFromPathname(pathname: string): string | null {
  const match = pathname.match(/\/intake\/([^/]+)$/);
  return match?.[1] ?? null;
}

export default function IntakeCreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { programId } = useParams<{ programId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { flowContext, isLoading } = useIntakeFlow(programId);

  useEffect(() => {
    if (!pathname || isLoading) return;

    const stepId = stepFromPathname(pathname);
    if (!stepId) return;

    const redirect = getRedirectStepForInvalidRoute(
      stepId as Parameters<typeof getRedirectStepForInvalidRoute>[0],
      flowContext,
    );
    if (redirect && redirect !== stepId) {
      router.replace(intakeStepPath(programId, redirect));
    }
  }, [pathname, programId, router, flowContext, isLoading]);

  if (isLoading) {
    return <CreateFlowLoading message="Loading intake wizard…" />;
  }

  return <>{children}</>;
}
