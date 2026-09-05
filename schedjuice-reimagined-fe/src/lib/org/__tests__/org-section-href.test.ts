import { describe, expect, it } from "vitest";
import { orgRecordBasePath, orgSectionHref } from "../org-section-href";

describe("orgRecordBasePath", () => {
  it("uses platform org record path by default", () => {
    expect(orgRecordBasePath("platform", 9)).toBe("/internal/organizations/9");
  });

  it("uses tenant profile path for tenant mode", () => {
    expect(orgRecordBasePath("tenant", 9)).toBe("/organizations/profile");
  });

  it("prefers explicit basePath when provided", () => {
    expect(orgRecordBasePath("platform", 9, "/custom")).toBe("/custom");
  });
});

describe("orgSectionHref", () => {
  it("builds platform section links without tenantId query", () => {
    expect(orgSectionHref("platform", 9, "video")).toBe(
      "/internal/organizations/9?section=video",
    );
  });

  it("includes pane and date without injecting tenantId", () => {
    expect(
      orgSectionHref("platform", 9, "ai", {
        pane: "usage",
        date: "2026-07-01",
      }),
    ).toBe(
      "/internal/organizations/9?section=ai&pane=usage&date=2026-07-01",
    );
  });

  it("does not add tenantId when basePath override is set", () => {
    expect(
      orgSectionHref("platform", 9, "video", { basePath: "/custom" }),
    ).toBe("/custom?section=video");
  });
});
