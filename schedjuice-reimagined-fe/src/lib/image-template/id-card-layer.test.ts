import { describe, expect, it } from "vitest";
import { createIdCardLayer } from "./id-card-layer";

describe("createIdCardLayer", () => {
  it("persists fontSize on text and leaves removeBackground off for ID photos", () => {
    const text = createIdCardLayer("text", 0);
    expect(text.type).toBe("text");
    if (text.type === "text") expect(text.fontSize).toBe(16);
    const photo = createIdCardLayer("photo", 1);
    expect(photo.type).toBe("photo");
    if (photo.type === "photo") {
      expect(photo.removeBackground).toBe(false);
      expect(photo.photoKind).toBe("id_image");
    }
  });
});
