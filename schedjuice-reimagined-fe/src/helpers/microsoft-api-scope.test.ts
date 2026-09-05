import { describe, expect, it } from "vitest";

import { microsoftApiAccessScope } from "./microsoft-api-scope";

describe("microsoftApiAccessScope", () => {
  it("builds the standard access_as_user scope for the app id", () => {
    expect(microsoftApiAccessScope("11111111-2222-3333-4444-555555555555")).toBe(
      "api://11111111-2222-3333-4444-555555555555/access_as_user",
    );
  });

  it("trims whitespace from the client id", () => {
    expect(microsoftApiAccessScope("  app-id  ")).toBe(
      "api://app-id/access_as_user",
    );
  });
});
