"use client";

import { PlatformDocsShell } from "@/components/product-docs/platform-docs-shell";
import { Spinner } from "@/components/primitives/spinner";
import { permissionsFor } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";

function ProductDocsAccessGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();
  const canAccess = permissionsFor(user).canAny(["docs.view", "docs.manage"]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-lg space-y-2 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You need docs.view or docs.manage to open Product Docs.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function PlatformDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductDocsAccessGate>
      <PlatformDocsShell>{children}</PlatformDocsShell>
    </ProductDocsAccessGate>
  );
}
