"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { Spinner } from "@/components/primitives/spinner";
import { ScholisConnectionPanel } from "@/components/scholis/connection-panel";
import { ScholisTeacherLinkPanel } from "@/components/scholis/teacher-link-panel";
import { usePageHeader } from "@/components/shell/use-page-header";
import { permissionsFor } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";

/**
 * School-level Scholis administration.
 *
 * Gated on ``organization.manage``, which the RBAC catalog describes as "manage
 * organization settings and integrations" — the same code the endpoints behind
 * this page enforce, so the page cannot be visible to somebody whose requests
 * would all be refused.
 */
function ScholisAccessGate({ children }: { children: ReactNode }) {
  const { user, isLoading: userLoading } = useUser();
  const { isLoading: tenantLoading } = useTenant();
  const router = useRouter();

  const allowed = permissionsFor(user).can("organization.manage");
  const isLoading = userLoading || tenantLoading;

  useEffect(() => {
    if (!isLoading && !allowed) {
      router.replace("/home");
    }
  }, [allowed, isLoading, router]);

  if (isLoading || !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function AdministrationScholisPage() {
  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Scholis</h1>
      ),
    }),
    [],
  );
  usePageHeader(headerConfig);

  return (
    <ScholisAccessGate>
      <PageContainer>
        <div className="space-y-6 py-6">
          <p className="max-w-3xl text-sm leading-relaxed text-text-muted">
            Scholis runs the assessments; the gradebook stays here. Once this
            school is connected, marks a teacher releases at Scholis arrive on
            their own and land in whichever column that paper was placed in.
            Nothing is graded twice, and letter grades are still computed here
            from your own grading scale.
          </p>

          <ScholisConnectionPanel />
          <ScholisTeacherLinkPanel />
        </div>
      </PageContainer>
    </ScholisAccessGate>
  );
}
