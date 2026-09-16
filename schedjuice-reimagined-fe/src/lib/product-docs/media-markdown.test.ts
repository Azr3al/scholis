import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  classifyMediaFile,
  parseMediaLine,
} from "./media-markdown";

describe("parseMediaLine", () => {
  it("parses video line", () => {
    expect(
      parseMediaLine("@[demo.mp4](video:https://github.com/o/r/demo.mp4)"),
    ).toEqual({
      type: "video",
      title: "demo.mp4",
      url: "https://github.com/o/r/demo.mp4",
    });
  });

  it("parses image line", () => {
    expect(parseMediaLine("![shot.png](https://github.com/o/r/shot.png)")).toEqual({
      type: "image",
      alt: "shot.png",
      url: "https://github.com/o/r/shot.png",
    });
  });

  it("returns null for plain text", () => {
    expect(parseMediaLine("Hello world")).toBeNull();
  });
});

describe("classifyMediaFile", () => {
  it("rejects oversize image", () => {
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    expect(classifyMediaFile(file)).toBeNull();
  });
});
