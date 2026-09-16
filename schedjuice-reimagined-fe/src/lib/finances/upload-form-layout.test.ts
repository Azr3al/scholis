import { describe, expect, it } from "vitest";
import {
  uploadPartFieldRootClassName,
  uploadPartScreenshotStackClassName,
  uploadPartSectionClassName,
} from "./upload-form-layout";

describe("upload-form-layout compact spacing", () => {
  it("uses gap-2 for part sections instead of gap-4", () => {
    const cls = uploadPartSectionClassName();
    expect(cls).toContain("gap-2");
    expect(cls).not.toContain("gap-4");
  });

  it("uses space-y-2 for the screenshot stack", () => {
    expect(uploadPartScreenshotStackClassName()).toBe("w-full space-y-2");
  });

  it("exposes a denser Field.Root className for upload parts", () => {
    expect(uploadPartFieldRootClassName()).toBe("w-full gap-1.5");
  });
});
