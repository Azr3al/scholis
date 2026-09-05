import { axiosClient } from "@/lib/api";
import { ORG_THEME_COOKIE } from "@/lib/sj/theme";
import {
  parseTenantCookie,
  tenantNeedsPublicRefresh,
  toTenantCookiePayload,
} from "@/lib/tenant-cookie";
import { organizationType } from "@/types/organization";
import { getCookie, setCookie } from "cookies-next";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_MS = 1000 * 60 * 30;

/** Shared query key so all `useTenant()` subscribers dedupe `organizations/public`. */
export const TENANT_PUBLIC_QUERY_KEY = ["organizations", "public"] as const;

function readTenantCookie(): organizationType | undefined {
  const raw = getCookie("tenant");
  if (!raw || typeof raw !== "string") return undefined;
  const parsed = parseTenantCookie(raw);
  return parsed.id != null ? parsed : undefined;
}

type OrgPublicPayload = organizationType & {
  theme?: unknown;
  schema_name?: string;
};

function writeTenantCookies(org: organizationType, mode: "initial" | "refetch") {
  const extended = org as OrgPublicPayload;
  const tenantExpires =
    mode === "refetch"
      ? new Date(Date.now() + ONE_DAY_MS)
      : new Date(Date.now() + TWO_HOURS_MS);
  // Full public org payloads exceed browser cookie limits; middleware only needs
  // a slim gate payload (id, flags, MSAL ids, …).
  setCookie("tenant", JSON.stringify(toTenantCookiePayload(extended)), {
    expires: tenantExpires,
  });
  setCookie(ORG_THEME_COOKIE, JSON.stringify(extended.theme ?? {}), {
    expires: new Date(Date.now() + ONE_DAY_MS),
  });
  const schema = extended.schema_name;
  if (schema) {
    setCookie("schema", schema, {
      expires: new Date(Date.now() + TWO_HOURS_MS),
    });
  }
}

/** Fetch `organizations/public` and rewrite the slim tenant cookie. */
export async function fetchAndPersistPublicTenant(
  mode: "initial" | "refetch" = "refetch",
): Promise<organizationType> {
  const { data } = await axiosClient.get("organizations/public");
  const org = data.data as organizationType;
  writeTenantCookies(org, mode);
  return org;
}

/**
 * If the current tenant cookie is missing required public fields (e.g. MSAL
 * app_id/authority while Microsoft login is enabled), refetch and rewrite it.
 * Returns the best-known tenant payload.
 */
export async function revalidateTenantCookieIfNeeded(
  tenantHint?: organizationType | null,
): Promise<organizationType | null> {
  const fromCookie = readTenantCookie();
  const candidate = tenantHint ?? fromCookie;
  if (candidate && !tenantNeedsPublicRefresh(candidate)) {
    return candidate;
  }
  try {
    return await fetchAndPersistPublicTenant("refetch");
  } catch {
    return fromCookie ?? tenantHint ?? null;
  }
}

export const useTenant = () => {
  const queryClient = useQueryClient();
  const fromCookie = readTenantCookie();
  const cookieNeedsRefresh = !fromCookie || tenantNeedsPublicRefresh(fromCookie);

  const query = useQuery<organizationType>({
    queryKey: TENANT_PUBLIC_QUERY_KEY,
    queryFn: async () => fetchAndPersistPublicTenant("initial"),
    // Slim cookie is bootstrap UI only (middleware gate fields). Do not use
    // initialData — that marks the query fresh and skips organizations/public,
    // so nav feature flags like is_payroll_calculation_enabled never arrive.
    placeholderData: fromCookie,
    // Incomplete cookies (MS on without app_id/authority) must not sit in a
    // 30-minute stale window — force a public revalidation immediately.
    staleTime: cookieNeedsRefresh ? 0 : DEFAULT_STALE_MS,
    cacheTime: 1000 * 60 * 60 * 24,
    refetchOnMount: cookieNeedsRefresh ? "always" : undefined,
    refetchOnWindowFocus: false,
  });

  const refetchTenant = async () => {
    const org = await fetchAndPersistPublicTenant("refetch");
    queryClient.setQueryData(TENANT_PUBLIC_QUERY_KEY, org);
    return org;
  };

  return {
    tenant: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetchTenant,
  };
};
