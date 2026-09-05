import {
  parseTenantCookie,
  tenantNeedsPublicRefresh,
} from "@/lib/tenant-cookie";
import { organizationType } from "@/types/organization";
import { cookies, headers } from "next/headers";
import { cache } from "react";

const PUBLIC_TENANT_REVALIDATE_SECONDS = 60;
const PUBLIC_TENANT_FETCH_TIMEOUT_MS = 1_500;

export async function fetchPublicTenant(
  host: string | null,
): Promise<organizationType> {
  const baseURL = process.env.NEXT_PUBLIC_BASE_API_URL;
  if (!baseURL) {
    throw new Error("env variable 'NEXT_PUBLIC_BASE_API_URL' is not undefined.");
  }

  const response = await fetch(`${baseURL.replace(/\/$/, "")}/organizations/public`, {
    headers: host ? { Origin: host } : {},
    next: { revalidate: PUBLIC_TENANT_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(PUBLIC_TENANT_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`organizations/public failed with ${response.status}`);
  }

  const body = (await response.json()) as { data?: organizationType };
  if (!body.data) {
    throw new Error("organizations/public returned no data");
  }
  return body.data;
}

export const getTenantOnServer = cache(async () => {
  const cookieStore = await cookies();
  const headerList = await headers();

  try {
    let tenant: organizationType = parseTenantCookie(
      cookieStore.get("tenant")?.value,
    );
    // Slim cookies historically omitted MSAL fields; login SSR must not trust
    // is_microsoft_on alone without app_id/authority.
    if (tenantNeedsPublicRefresh(tenant)) {
      tenant = await fetchPublicTenant(headerList.get("Host"));
      return { tenant };
    }

    return { tenant };
  } catch (err) {
    console.log(err);
  }
  return { tenant: undefined };
});
