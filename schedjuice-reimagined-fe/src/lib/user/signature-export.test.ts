import { describe, expect, it } from "vitest";

import { dataUrlToPngFile } from "@/lib/user/signature-export";

describe("dataUrlToPngFile", () => {
  it("converts a PNG data URL to a File", () => {
    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const file = dataUrlToPngFile(pixel, "signature.png");
    expect(file.name).toBe("signature.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(0);
  });

  it("rejects non-PNG data URLs", () => {
    expect(() =>
      dataUrlToPngFile("data:image/jpeg;base64,abc", "signature.png"),
    ).toThrow(/png/i);
  });
});
