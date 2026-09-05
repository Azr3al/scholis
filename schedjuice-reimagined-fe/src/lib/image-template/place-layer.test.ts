import { describe, expect, it } from "vitest";
import { layerOriginForViewCenter } from "./place-layer";

describe("layerOriginForViewCenter", () => {
  it("centers a 200x40 box on the document point under the view center", () => {
    expect(
      layerOriginForViewCenter({
        viewCenterDocument: { x: 400, y: 300 },
        width: 200,
        height: 40,
      }),
    ).toEqual({ x: 300, y: 280 });
  });
});
