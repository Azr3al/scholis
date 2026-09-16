import { describe, expect, it } from "vitest";
import { pagePresetsForKind, sizeForPreset } from "./page-presets";

describe("pagePresetsForKind", () => {
  it("id_card offers only CR80 portrait and landscape", () => {
    expect(pagePresetsForKind("id_card")).toEqual([
      "id_cr80_portrait",
      "id_cr80_landscape",
    ]);
    expect(pagePresetsForKind("id_card")).not.toContain("hd_16_9");
    expect(pagePresetsForKind("id_card")).not.toContain("a4_landscape");
  });

  it("award offers original, 16:9, A4, custom — not CR80", () => {
    expect(pagePresetsForKind("award")).toEqual([
      "original",
      "hd_16_9",
      "a4_landscape",
      "custom",
    ]);
  });

  it("CR80 portrait is 2.125 x 3.375 in", () => {
    expect(sizeForPreset("id_cr80_portrait")).toEqual({
      width: 2.125,
      height: 3.375,
      unit: "in",
    });
  });

  it("16:9 HD is 1920 x 1080 px", () => {
    expect(sizeForPreset("hd_16_9")).toEqual({
      width: 1920,
      height: 1080,
      unit: "px",
    });
  });

  it("A4 landscape is 3508 x 2480 px", () => {
    expect(sizeForPreset("a4_landscape")).toEqual({
      width: 3508,
      height: 2480,
      unit: "px",
    });
  });
});
