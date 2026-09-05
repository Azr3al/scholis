import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("login page SSR", () => {
  it("does not block the document on organizations/public", () => {
    const src = readFileSync(
      path.resolve(__dirname, "./page.tsx"),
      "utf8",
    );
    expect(src).not.toContain("getTenantOnServer");
    expect(src).toContain("LoginForm");
  });
});
