import { describe, expect, it } from "vitest";

import {
  buildPlatformAdminLoginRedirectUrl,
  buildPlatformAdminUrl,
} from "./platform-admin-url";

describe("buildPlatformAdminUrl", () => {
  it("builds https url for production domain", () => {
    expect(buildPlatformAdminUrl("schedjuice.thiha.net", "/platform/docs/1")).toBe(
      "https://schedjuice.thiha.net/platform/docs/1",
    );
  });

  it("builds http url for localhost", () => {
    expect(buildPlatformAdminUrl("localhost:3000", "/login")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("throws when path does not start with slash", () => {
    expect(() => buildPlatformAdminUrl("schedjuice.thiha.net", "nope")).toThrow();
  });
});

describe("buildPlatformAdminLoginRedirectUrl", () => {
  it("encodes next destination", () => {
    expect(
      buildPlatformAdminLoginRedirectUrl("schedjuice.thiha.net", "/platform/docs/42"),
    ).toBe("https://schedjuice.thiha.net/login?next=%2Fplatform%2Fdocs%2F42");
  });
});
