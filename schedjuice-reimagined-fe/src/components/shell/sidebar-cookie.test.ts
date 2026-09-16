import { describe, it, expect } from "vitest";
import { parseSidebarCookie, SIDEBAR_COOKIE } from "./sidebar-cookie";

describe("parseSidebarCookie", () => {
  it("returns true when no cookie is set (default open)", () => {
    expect(parseSidebarCookie("")).toBe(true);
  });
  it("reads false", () => {
    expect(parseSidebarCookie(`${SIDEBAR_COOKIE}=false`)).toBe(false);
  });
  it("reads true among other cookies", () => {
    expect(parseSidebarCookie(`a=1; ${SIDEBAR_COOKIE}=true; b=2`)).toBe(true);
  });
  it("treats any non-false value as open", () => {
    expect(parseSidebarCookie(`${SIDEBAR_COOKIE}=anything`)).toBe(true);
  });
});
