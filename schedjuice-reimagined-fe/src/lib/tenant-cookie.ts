import type { NextRequest } from "next/server";
import type { organizationType } from "@/types/organization";

/**
 * Fields middleware + public login need from the tenant cookie.
 * The full `organizations/public` payload exceeds browser cookie limits (~4KB)
 * once URL-encoded, so we persist only this slim subset (including MSAL ids).
 */
export type TenantCookiePayload = Pick<
  organizationType,
  | "id"
  | "name"
  | "domain_url"
  | "is_admin"
  | "is_demo"
  | "is_homepage_disabled"
  | "is_library_disabled"
  | "is_microsoft_on"
  | "is_crm_enabled"
> & {
  schema_name?: string;
  app_id?: string;
  authority?: string;
};

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function toTenantCookiePayload(
  org: organizationType & { schema_name?: string },
): TenantCookiePayload {
  const appId = nonEmptyString(org.app_id);
  const authority = nonEmptyString(org.authority);
  return {
    id: org.id,
    name: org.name,
    domain_url: org.domain_url,
    is_admin: Boolean(org.is_admin),
    is_demo: Boolean(org.is_demo),
    is_homepage_disabled: Boolean(org.is_homepage_disabled),
    is_library_disabled: Boolean(org.is_library_disabled),
    is_microsoft_on: Boolean(org.is_microsoft_on),
    is_crm_enabled: Boolean(org.is_crm_enabled),
    ...(org.schema_name ? { schema_name: org.schema_name } : {}),
    ...(appId ? { app_id: appId } : {}),
    ...(authority ? { authority } : {}),
  };
}

/** True when SSR/bootstrap should re-fetch `organizations/public` instead of trusting the cookie alone. */
export function tenantNeedsPublicRefresh(tenant: organizationType): boolean {
  if (!tenant.domain_url) {
    return true;
  }
  if (
    tenant.is_microsoft_on &&
    (!nonEmptyString(tenant.app_id) || !nonEmptyString(tenant.authority))
  ) {
    return true;
  }
  return false;
}

export function parseTenantCookie(
  raw: string | undefined | null,
): organizationType {
  if (!raw) {
    return {} as organizationType;
  }
  try {
    let parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (!parsed || typeof parsed !== "object") {
      return {} as organizationType;
    }
    return parsed as organizationType;
  } catch {
    return {} as organizationType;
  }
}

export function getTenantFromRequest(request: NextRequest): organizationType {
  return parseTenantCookie(request.cookies.get("tenant")?.value);
}
