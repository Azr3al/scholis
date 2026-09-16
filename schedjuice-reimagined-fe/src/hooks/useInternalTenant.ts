"use client";

import { parseAsString, useQueryState } from "nuqs";

export function normalizeInternalTenantId(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseInternalTenantId(raw: string): number | null {
  const normalized = normalizeInternalTenantId(raw);
  if (!normalized || !/^\d+$/.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

export function useInternalTenant() {
  const [tenantId, setTenantId] = useQueryState(
    "tenantId",
    parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
  );
  const normalized = normalizeInternalTenantId(tenantId);

  return {
    tenantId: normalized,
    setTenantId: (id: string | null) => setTenantId(id ?? ""),
    organizationId: parseInternalTenantId(tenantId),
  };
}
