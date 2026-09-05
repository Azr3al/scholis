import type { NextRequest } from "next/server";
import { accountType, role } from "@/types/user";

/** Small cookie so edge middleware can read roles without parsing the full account blob. */
export const ACCOUNT_ROLES_COOKIE = "account_roles";

export function normalizeRoles(roles: unknown): string[] {
  if (!Array.isArray(roles)) return [];
  return roles.map((r) => String(r).trim()).filter(Boolean);
}

export function parseAccountCookie(raw: string | undefined | null): accountType {
  if (!raw) {
    return { roles: [] } as unknown as accountType;
  }
  try {
    let parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (!parsed || typeof parsed !== "object") {
      return { roles: [] } as unknown as accountType;
    }
    const account = parsed as accountType;
    return {
      ...account,
      roles: normalizeRoles(account.roles) as accountType["roles"],
    };
  } catch {
    return { roles: [] } as unknown as accountType;
  }
}

function parseRolesCookie(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return normalizeRoles(parsed);
  } catch {
    return [];
  }
}

/** Merge the lightweight roles cookie with the account blob (roles cookie wins when set). */
export function getAccountFromRequest(request: NextRequest): accountType {
  const account = parseAccountCookie(request.cookies.get("account")?.value);
  const rolesFromCookie = parseRolesCookie(
    request.cookies.get(ACCOUNT_ROLES_COOKIE)?.value,
  );
  if (rolesFromCookie.length === 0) {
    return account;
  }
  return {
    ...account,
    roles: rolesFromCookie as accountType["roles"],
  };
}

export function hasSuperadminRole(roles: unknown): boolean {
  return normalizeRoles(roles).some(
    (r) => r.toLowerCase() === role.superadmin,
  );
}
