import { describe, expect, it } from "vitest";
import { backgroundDestRect } from "@/lib/image-template/composite";

describe("id card background crop", () => {
  it("does not stretch with drawImage(0,0,pageW,pageH) when scale is set", () => {
    const page = { width: 638, height: 1013 };
    const image = { width: 2000, height: 2000 };
    const rect = backgroundDestRect(
      { url: "u", offsetX: -100, offsetY: -50, scale: 0.6 },
      image,
      page,
    );
    expect(rect.width).toBe(1200);
    expect(rect.height).toBe(1200);
    expect(rect.x).toBe(-100);
  });
});
