"use client";
import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";

// The permit/deny decision is the pure can/canAny/canAll logic from
// makePermissionChecker, which is unit-tested in
// src/hooks/__tests__/usePermissions.test.ts. This component is a thin
// client wrapper over that logic (no separate render test: RTL is not installed).

type Props = {
  permission?: string;
  anyOf?: string[];
  allOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
};

export function Can({ permission, anyOf, allOf, fallback = null, children }: Props) {
  const { can, canAny, canAll } = usePermissions();
  let ok = true;
  if (permission) ok = ok && can(permission);
  if (anyOf) ok = ok && canAny(anyOf);
  if (allOf) ok = ok && canAll(allOf);
  return <>{ok ? children : fallback}</>;
}
