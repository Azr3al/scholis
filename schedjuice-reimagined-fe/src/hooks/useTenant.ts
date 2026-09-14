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
const TENANT_QUERY_MAX_RETRIES = 3;
const TENANT_QUERY_MAX_RETRY_DELAY_MS = 8_000;

/**
 * The backend's tenant middleware raises `Http404` when no Organization matches
 * the request Origin, so 404 is the only definitive "this host has no tenant".
 * Timeouts, 429s and 5xx mean "ask again", not "this school does not exist".
 */
export function isTenantNotFoundError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  return status === 404;
}

export function tenantQueryRetry(failureCount: number, error: unknown): boolean {
  if (isTenantNotFoundError(error)) return false;
  return failureCount < TENANT_QUERY_MAX_RETRIES;
}

export function tenantQueryRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, TENANT_QUERY_MAX_RETRY_DELAY_MS);
}

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
    // A visitor with no tenant cookie (in-app browsers keep their own cookie
    // jar) has nothing to fall back on, so a single flaky request must not
    // decide that the tenant is missing.
    retry: tenantQueryRetry,
    retryDelay: tenantQueryRetryDelay,
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
    isError: query.isError,
    /** True only when the backend answered "no tenant for this host" (404). */
    isTenantMissing: isTenantNotFoundError(query.error),
    retryTenant: query.refetch,
    refetchTenant,
  };
};
