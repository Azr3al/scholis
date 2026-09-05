import { describe, expect, it } from "vitest";

import {
  schemaNameFromDomainUrl,
  withInternalTenantId,
} from "./internal-tenant-schema";

describe("schemaNameFromDomainUrl", () => {
  it("matches OrganizationSerializer.create", () => {
    expect(schemaNameFromDomainUrl("teachersu.com")).toBe("xteachersucom");
    expect(schemaNameFromDomainUrl("Foo.Bar.Baz")).toBe("xfoobarbaz");
  });
});

describe("withInternalTenantId", () => {
  it("appends tenantId to paths without query", () => {
    expect(withInternalTenantId("/internal/microsoft-bulk-repair", "42")).toBe(
      "/internal/microsoft-bulk-repair?tenantId=42",
    );
  });

  it("preserves existing query params", () => {
    expect(
      withInternalTenantId(
        "/internal/microsoft-bulk-repair?target=users",
        "7",
      ),
    ).toBe("/internal/microsoft-bulk-repair?target=users&tenantId=7");
  });

  it("returns href unchanged when tenantId missing", () => {
    expect(withInternalTenantId("/internal/microsoft-health", null)).toBe(
      "/internal/microsoft-health",
    );
  });
});
