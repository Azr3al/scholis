import { describe, expect, it } from "vitest";
import { buildVerifyUrl } from "./verify-url";

describe("buildVerifyUrl", () => {
  it("prefers verifyCode over verifyToken", () => {
    expect(
      buildVerifyUrl("https://x.com", {
        verifyCode: "v_abc12345",
        verifyToken: "long.jwt.token",
      }),
    ).toBe("https://x.com/verify/v_abc12345");
  });

  it("falls back to verifyToken when code is missing", () => {
    expect(buildVerifyUrl("https://x.com", { verifyToken: "tok_abc" })).toBe(
      "https://x.com/verify/tok_abc",
    );
  });

  it("trims a trailing slash on the origin", () => {
    expect(buildVerifyUrl("https://x.com/", { verifyCode: "v_abc12345" })).toBe(
      "https://x.com/verify/v_abc12345",
    );
  });

  it("returns empty string when both segments are missing", () => {
    expect(buildVerifyUrl("https://x.com", null)).toBe("");
    expect(buildVerifyUrl("https://x.com", {})).toBe("");
  });
});
