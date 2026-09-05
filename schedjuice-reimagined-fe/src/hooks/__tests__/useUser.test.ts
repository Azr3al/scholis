import { describe, expect, it } from "vitest";
import { isWebAuthPath } from "@/lib/linking/open-in-app-prompt-state";

/** useUser skips `users/profile` when `isWebAuthPath(pathname)` is true. */
describe("useUser auth path guard", () => {
  it("treats login and related auth routes as no-profile-fetch paths", () => {
    for (const path of [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
    ]) {
      expect(isWebAuthPath(path)).toBe(true);
    }
  });

  it("still fetches profile on internal routes", () => {
    expect(isWebAuthPath("/home")).toBe(false);
    expect(isWebAuthPath("/users/1")).toBe(false);
  });
});
