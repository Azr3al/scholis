import { describe, expect, it } from "vitest";
import type { Area } from "react-easy-crop";
import { previewLogoUrlForCrop } from "./preview-logo-url-for-crop";

describe("previewLogoUrlForCrop", () => {
  const area: Area = { x: 0, y: 0, width: 100, height: 100 };

  it("prefers debounced cropped preview URL when ready", () => {
    expect(
      previewLogoUrlForCrop("blob:src", area, "blob:cropped"),
    ).toBe("blob:cropped");
  });

  it("falls back to full imageSrc before cropped blob is ready", () => {
    expect(previewLogoUrlForCrop("blob:src", area, null)).toBe("blob:src");
  });

  it("returns null when no sources exist", () => {
    expect(previewLogoUrlForCrop(null, null, null)).toBeNull();
  });
});
