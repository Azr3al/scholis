import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { canAccessPlatformOrganizations } from "@/helpers/authorization";
import { role } from "@/types/user";
import {
  getTenantFromRequest,
  tenantNeedsPublicRefresh,
  toTenantCookiePayload,
} from "./tenant-cookie";

const fatPublicOrg = {
  id: 1,
  name: "Teacher Su Intl School",
  domain_url: "schedjuice.thiha.net",
  schema_name: "xschedjuice",
  is_admin: true,
  is_demo: false,
  is_homepage_disabled: false,
  is_library_disabled: false,
  is_microsoft_on: true,
  app_id: "11111111-1111-1111-1111-111111111111",
  authority: "https://login.microsoftonline.com/contoso.onmicrosoft.com",
  // Inflate like the real public serializer (logos, theme, …).
  logo: "https://example.com/" + "x".repeat(400),
  id_card_logo: "https://example.com/" + "y".repeat(400),
  default_cover_image: "https://example.com/" + "z".repeat(400),
  theme: { colors: { primary: "#000" }, unused: "a".repeat(500) },
  is_wd_we_course_types_enabled: true,
  description: "d".repeat(200),
  tagline: "t".repeat(80),
  private_key: "k".repeat(2000),
  client_secret: "s".repeat(200),
} as const;

describe("toTenantCookiePayload", () => {
  it("keeps middleware gate fields and MS login fields under the browser cookie limit", () => {
    const payload = toTenantCookiePayload(fatPublicOrg as never);
    const encoded = encodeURIComponent(JSON.stringify(payload));

    expect(payload.is_admin).toBe(true);
    expect(payload.id).toBe(1);
    expect(payload.domain_url).toBe("schedjuice.thiha.net");
    expect(payload.is_microsoft_on).toBe(true);
    expect(payload.is_crm_enabled).toBeFalsy();
    expect(payload.app_id).toBe(fatPublicOrg.app_id);
    expect(payload.authority).toBe(fatPublicOrg.authority);
    expect(encoded.length).toBeLessThan(4096);
    expect(JSON.stringify(payload).length).toBeLessThan(
      JSON.stringify(fatPublicOrg).length / 2,
    );
  });

  it("omits empty MS fields", () => {
    const payload = toTenantCookiePayload({
      ...fatPublicOrg,
      app_id: "",
      authority: null,
    } as never);
    expect(payload).not.toHaveProperty("app_id");
    expect(payload).not.toHaveProperty("authority");
  });
});

describe("tenantNeedsPublicRefresh", () => {
  it("refetches when cookie has no domain", () => {
    expect(tenantNeedsPublicRefresh({} as never)).toBe(true);
  });

  it("refetches when Microsoft is on but app_id/authority are missing", () => {
    expect(
      tenantNeedsPublicRefresh({
        domain_url: "suconnect.teachersucenter.com",
        is_microsoft_on: true,
      } as never),
    ).toBe(true);
  });

  it("skips refetch when Microsoft login fields are present", () => {
    expect(
      tenantNeedsPublicRefresh({
        domain_url: "suconnect.teachersucenter.com",
        is_microsoft_on: true,
        app_id: "app",
        authority: "https://login.microsoftonline.com/x",
      } as never),
    ).toBe(false);
  });
});

describe("getTenantFromRequest", () => {
  it("parses the slim tenant cookie for platform access checks", () => {
    const slim = toTenantCookiePayload(fatPublicOrg as never);
    const req = new NextRequest("http://localhost/internal", {
      headers: {
        cookie: `tenant=${encodeURIComponent(JSON.stringify(slim))}`,
      },
    });
    const tenant = getTenantFromRequest(req);
    expect(
      canAccessPlatformOrganizations(
        { id: 1, roles: [role.superadmin] } as never,
        tenant,
      ),
    ).toBe(true);
  });

  it("treats a missing/empty tenant cookie as non-admin", () => {
    const req = new NextRequest("http://localhost/internal", {
      headers: { cookie: "tenant=%7B%7D" },
    });
    const tenant = getTenantFromRequest(req);
    expect(tenant.is_admin).toBeFalsy();
    expect(
      canAccessPlatformOrganizations(
        { id: 1, roles: [role.superadmin] } as never,
        tenant,
      ),
    ).toBe(false);
  });
});
