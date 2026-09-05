import { describe, expect, it } from "vitest";

import { buildAppDeepLink } from "@/lib/linking/build-app-deep-link";
import { buildAppleAppSiteAssociation } from "@/config/universal-link-registry";

describe("buildAppDeepLink", () => {

  it("builds teachersucenter scheme for teachersu host", () => {
    expect(
      buildAppDeepLink({
        host: "suconnect.teachersucenter.com",
        pathname: "/users/42",
        search: "?tab=profile",
      }),
    ).toBe("teachersucenter:///users/42?tab=profile");
  });

  it("returns null for unknown host", () => {
    expect(
      buildAppDeepLink({
        host: "unknown.example.com",
        pathname: "/",
      }),
    ).toBeNull();
  });
});

describe("universal-link-registry association files", () => {
  it("AASA excludes all paths (no auto-open)", () => {
    const aasa = buildAppleAppSiteAssociation("TEAMID", "com.schedjuice.mobile");
    expect(aasa.applinks.details[0].components).toEqual([
      expect.objectContaining({ "/": "*", exclude: true }),
    ]);
    expect(aasa.applinks.details[0]).not.toHaveProperty("paths");
  });
});
