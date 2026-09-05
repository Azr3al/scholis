import { describe, expect, it } from "vitest";
import { generateQrDataUrl } from "./qr";

describe("generateQrDataUrl", () => {
  it("returns empty string for empty input", async () => {
    expect(await generateQrDataUrl("")).toBe("");
  });

  it("honors custom targetPx and margin options", async () => {
    const url = await generateQrDataUrl("https://x.com/verify/v_abc12345", {
      targetPx: 180,
      margin: 2,
    });
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
