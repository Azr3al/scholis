import { describe, expect, it } from "vitest";

import { decodeRoleString, encodeRoleString } from "@/lib/rbac/role-string";

describe("role-string", () => {
  it("round-trips a role payload", () => {
    const payload = {
      label: "Finance Lead",
      slug: "finance",
      codes: ["payment.verify", "course.view", "course.view"],
    };

    const encoded = encodeRoleString(payload);
    expect(encoded.startsWith("sj1.")).toBe(true);

    expect(decodeRoleString(encoded)).toEqual({
      label: "Finance Lead",
      slug: "finance",
      codes: ["course.view", "payment.verify"],
    });
  });

  it("rejects invalid prefixes", () => {
    expect(() => decodeRoleString("bad-prefix")).toThrow(/prefix/i);
  });
});
