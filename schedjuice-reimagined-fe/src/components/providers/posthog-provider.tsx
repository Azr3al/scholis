"use client";

import { isAdmin, isStudent, isSuperAdmin } from "@/helpers/authorization";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { capturePageview, initPostHog, shouldTrackPage } from "@/lib/posthog";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

function roleBucket(user: ReturnType<typeof useUser>["user"]): string {
  if (!user) return "anonymous";
  if (isSuperAdmin(user)) return "superadmin";
  if (isAdmin(user)) return "admin";
  if (isStudent(user)) return "student";
  return "staff";
}

function tenantSchemaValue(tenant: ReturnType<typeof useTenant>["tenant"]): string | null {
  if (!tenant) return null;
  const schemaName = (tenant as { schema_name?: unknown }).schema_name;
  if (typeof schemaName === "string" && schemaName.trim()) return schemaName;
  const schema = (tenant as { schema?: unknown }).schema;
  if (typeof schema === "string" && schema.trim()) return schema;
  return null;
}

function PostHogInner({
  children,
  roleBucketValue,
}: {
  children: React.ReactNode;
  roleBucketValue: string;
}) {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const initialized = useRef(false);
  const tenantSchema = useMemo(() => tenantSchemaValue(tenant), [tenant]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (typeof window === "undefined") return;

    const run = () => initPostHog();
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run);
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(run, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!pathname) return;
    capturePageview(pathname, {
      tenant_schema: tenantSchema,
      org_id: tenant?.id ?? null,
      role_bucket: roleBucketValue,
      environment: process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT ?? "development",
    });
  }, [pathname, tenantSchema, tenant?.id, roleBucketValue]);

  return <>{children}</>;
}

function PostHogWithUser({ children }: { children: React.ReactNode }) {
  const { user } = useUser(false);
  const bucket = useMemo(() => roleBucket(user), [user]);
  return <PostHogInner roleBucketValue={bucket}>{children}</PostHogInner>;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!pathname || !shouldTrackPage(pathname)) {
    return (
      <PostHogInner roleBucketValue="anonymous">{children}</PostHogInner>
    );
  }

  return <PostHogWithUser>{children}</PostHogWithUser>;
}
