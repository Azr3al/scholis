import { describe, expect, it } from "vitest";
import { applyPagePreset } from "./apply-page-preset";
import { emptyAwardDocument } from "./award-document";
import { pagePresetsForKind } from "./page-presets";

describe("applyPagePreset", () => {
  it("does not offer 16:9 on id_card via pagePresetsForKind", () => {
    expect(pagePresetsForKind("id_card")).not.toContain("hd_16_9");
  });

  it("custom sizes above 8192 are rejected", () => {
    expect(() =>
      applyPagePreset(emptyAwardDocument(), "custom", { width: 100, height: 100 }, {
        width: 9000,
        height: 100,
      }),
    ).toThrow(/8192/);
  });
});
