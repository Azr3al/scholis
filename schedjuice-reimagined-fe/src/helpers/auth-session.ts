import { deleteCookie, getCookie, setCookie } from "cookies-next";
import {
  ACCOUNT_ROLES_COOKIE,
  normalizeRoles,
} from "@/lib/account-cookie";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type AuthTokenPayload = {
  access: string;
  refresh?: string;
  session_id?: string;
  refresh_expires_at?: string;
  schema_name?: string;
  user?: unknown;
};

type RefreshApiBody = {
  isError?: boolean;
  message?: string;
  data?: AuthTokenPayload;
} & Partial<AuthTokenPayload>;

/** Accept nested `{ data: { access } }` or legacy flat `{ access }` refresh responses. */
export function unwrapAuthTokenPayload(
  body: RefreshApiBody | null | undefined,
): AuthTokenPayload | null {
  if (!body || body.isError) {
    return null;
  }
  if (body.data?.access) {
    return body.data;
  }
  if (body.access) {
    return {
      access: body.access,
      refresh: body.refresh,
      session_id: body.session_id,
      refresh_expires_at: body.refresh_expires_at,
      schema_name: body.schema_name,
      user: body.user,
    };
  }
  return null;
}

const ACCESS_COOKIE_HOURS = 8;

function cookieExpiryFromRefresh(iso?: string): Date {
  if (iso) {
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(Date.now() + 7 * DAY_MS);
}

function accessCookieExpiry(): Date {
  return new Date(Date.now() + ACCESS_COOKIE_HOURS * HOUR_MS);
}

/** Persist access, refresh, session, account, and schema after login or token refresh. */
export function persistAuthCookies(payload: AuthTokenPayload): void {
  const refreshExpiry = cookieExpiryFromRefresh(payload.refresh_expires_at);
  const accessExpiry = accessCookieExpiry();

  setCookie("access", payload.access, { expires: accessExpiry });
  if (payload.user !== undefined) {
    const accountValue =
      typeof payload.user === "string"
        ? payload.user
        : JSON.stringify(payload.user);
    setCookie("account", accountValue, { expires: accessExpiry });
    try {
      const userObj =
        typeof payload.user === "string"
          ? JSON.parse(payload.user)
          : payload.user;
      setCookie(
        ACCOUNT_ROLES_COOKIE,
        JSON.stringify(normalizeRoles(userObj?.roles)),
        { expires: accessExpiry },
      );
    } catch {
      // account blob is still persisted; roles cookie is best-effort
    }
  }
  if (payload.schema_name) {
    setCookie("schema", payload.schema_name, { expires: refreshExpiry });
  }
  if (payload.refresh) {
    setCookie("refresh", payload.refresh, { expires: refreshExpiry });
  }
  if (payload.session_id) {
    setCookie("session_id", payload.session_id, { expires: refreshExpiry });
  }
  if (payload.refresh_expires_at) {
    setCookie("refresh_expires_at", payload.refresh_expires_at, {
      expires: refreshExpiry,
    });
  }
}

export function getRefreshCredentials(): {
  refresh: string | undefined;
  session_id: string | undefined;
} {
  return {
    refresh: getCookie("refresh") as string | undefined,
    session_id: getCookie("session_id") as string | undefined,
  };
}

export function clearAuthCookies(): void {
  deleteCookie("access");
  deleteCookie("account");
  deleteCookie(ACCOUNT_ROLES_COOKIE);
  deleteCookie("refresh");
  deleteCookie("session_id");
  deleteCookie("refresh_expires_at");
  deleteCookie("tenant");
}
