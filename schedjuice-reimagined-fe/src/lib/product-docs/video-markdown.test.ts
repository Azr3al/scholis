import { describe, expect, it } from "vitest";

import { parseHostedVideoHref } from "./video-markdown";

describe("parseHostedVideoHref", () => {
  it("parses video protocol links", () => {
    expect(
      parseHostedVideoHref(
        "video:https://github.com/schedjuice/product-docs-videos/releases/download/videos/demo.mp4",
      ),
    ).toBe(
      "https://github.com/schedjuice/product-docs-videos/releases/download/videos/demo.mp4",
    );
  });

  it("parses GitHub release download URLs", () => {
    expect(
      parseHostedVideoHref(
        "https://github.com/schedjuice/product-docs-videos/releases/download/videos/a1b2-demo.mp4",
      ),
    ).toBe(
      "https://github.com/schedjuice/product-docs-videos/releases/download/videos/a1b2-demo.mp4",
    );
  });

  it("parses raw.githubusercontent.com video URLs", () => {
    expect(
      parseHostedVideoHref(
        "https://raw.githubusercontent.com/schedjuice/product-docs-videos/main/videos/demo.mp4",
      ),
    ).toBe(
      "https://raw.githubusercontent.com/schedjuice/product-docs-videos/main/videos/demo.mp4",
    );
  });

  it("returns null for non-video links", () => {
    expect(parseHostedVideoHref("https://example.com/page")).toBeNull();
  });
});
