import { describe, expect, it } from "vitest";
import {
  internalNavLinks,
  isInternalNavItemActive,
} from "../internal-nav-routes";

describe("internalNavLinks", () => {
  it("omits Overview and Organization Settings", () => {
    const hrefs = internalNavLinks.map((item) => item.href);
    const titles = internalNavLinks.map((item) => item.title);
    expect(hrefs).not.toContain("/internal");
    expect(hrefs).not.toContain("/internal/org-settings");
    expect(titles).not.toContain("Overview");
    expect(titles).not.toContain("Organization Settings");
    expect(hrefs).toContain("/internal/organizations");
  });
});

describe("isInternalNavItemActive", () => {
  it("matches organizations self and nested record paths", () => {
    expect(
      isInternalNavItemActive(
        "/internal/organizations",
        "/internal/organizations",
      ),
    ).toBe(true);
    expect(
      isInternalNavItemActive(
        "/internal/organizations/9",
        "/internal/organizations",
      ),
    ).toBe(true);
    expect(
      isInternalNavItemActive("/internal/billing", "/internal/organizations"),
    ).toBe(false);
  });
});
