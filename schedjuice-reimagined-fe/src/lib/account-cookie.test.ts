import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ROLES_COOKIE,
  getAccountFromRequest,
  hasSuperadminRole,
  parseAccountCookie,
} from "./account-cookie";
import { isSuperAdmin } from "@/helpers/authorization";
import { NextRequest } from "next/server";

describe("account-cookie", () => {
  it("parses roles from the dedicated account_roles cookie", () => {
    const req = new NextRequest("http://localhost/components", {
      headers: {
        cookie: `${ACCOUNT_ROLES_COOKIE}=${encodeURIComponent(JSON.stringify(["superadmin"]))}; account=${encodeURIComponent(JSON.stringify({ id: 1, roles: [] }))}`,
      },
    });
    const account = getAccountFromRequest(req);
    expect(account.roles).toEqual(["superadmin"]);
    expect(isSuperAdmin(account)).toBe(true);
  });

  it("falls back to roles on the account blob", () => {
    const account = parseAccountCookie(
      JSON.stringify({ id: 2, roles: ["superadmin", "admin"] }),
    );
    expect(hasSuperadminRole(account.roles)).toBe(true);
    expect(isSuperAdmin(account)).toBe(true);
  });

  it("detects superadmin via platform-internal permissions when roles are missing", () => {
    expect(
      isSuperAdmin({
        id: 3,
        roles: [],
        permissions: ["course.view", "org.manage_all"],
      } as never),
    ).toBe(true);
  });

  it("rejects non-superadmin accounts", () => {
    expect(
      isSuperAdmin({
        id: 4,
        roles: ["admin"],
        permissions: ["course.view"],
      } as never),
    ).toBe(false);
  });
});
