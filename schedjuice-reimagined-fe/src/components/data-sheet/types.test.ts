import { describe, expect, it } from "vitest";

import { fontThemeFieldsFor } from "./types";

describe("fontThemeFieldsFor", () => {
  it("clamps marker and header sizes for tiny fonts", () => {
    const fields = fontThemeFieldsFor(9, "Geist");
    expect(fields.markerFontFull).toBe("8px Geist");
    expect(fields.headerFontFull).toBe("600 9px Geist");
  });
});
