import { describe, expect, it } from "vitest";
import { svgStringToDataUrl } from "./svg-data-url";

describe("svgStringToDataUrl", () => {
  it("escapes characters that break data URLs", () => {
    const url = svgStringToDataUrl('<svg>#&"</svg>');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(url).not.toContain("#");
    expect(url).not.toContain('"');
  });
});
