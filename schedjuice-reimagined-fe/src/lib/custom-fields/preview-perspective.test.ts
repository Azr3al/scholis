import { describe, expect, it } from "vitest";
import { defaultPerspectiveForSurface } from "./preview-perspective";

describe("defaultPerspectiveForSurface", () => {
  it("defaults create to staff and edit/detail to self", () => {
    expect(defaultPerspectiveForSurface("create")).toBe("staff");
    expect(defaultPerspectiveForSurface("edit")).toBe("self");
    expect(defaultPerspectiveForSurface("detail")).toBe("self");
  });
});
