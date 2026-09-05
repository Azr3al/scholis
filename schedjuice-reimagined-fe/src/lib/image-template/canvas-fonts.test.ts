import { describe, expect, it } from "vitest";
import { CANVAS_FONT_ALLOWLIST, canvasFontFamily } from "./canvas-fonts";

describe("canvas fonts", () => {
  it("allowlist has no Myanmar face", () => {
    const joined = CANVAS_FONT_ALLOWLIST.map((f) => f.family.toLowerCase()).join(" ");
    expect(joined).not.toMatch(/myanmar/);
    expect(joined).not.toMatch(/schedjuice sans/);
    expect(joined).not.toMatch(/schedjuice serif/);
  });

  it("stored Arial still round-trips as Arial", () => {
    expect(canvasFontFamily("Arial")).toBe("Arial");
  });

  it("offers hosted Google faces in the picker", () => {
    const families = CANVAS_FONT_ALLOWLIST.map((font) => font.family);
    expect(families).toEqual(
      expect.arrayContaining([
        "Poppins",
        "Montserrat",
        "Roboto",
        "Playfair Display",
        "Lora",
      ]),
    );
    expect(canvasFontFamily("Poppins")).toBe("Poppins");
    expect(canvasFontFamily("Playfair Display")).toBe("Playfair Display");
  });

  it("offers common web-native faces in the picker", () => {
    const families = CANVAS_FONT_ALLOWLIST.map((font) => font.family);
    expect(families).toEqual(
      expect.arrayContaining([
        "Noto Sans",
        "Fraunces",
        "Adobe Caslon Pro",
        "Arial",
        "Helvetica",
        "Verdana",
        "Tahoma",
        "Trebuchet MS",
        "Georgia",
        "Times New Roman",
        "Palatino",
        "Garamond",
        "Courier New",
        "Impact",
      ]),
    );
    expect(canvasFontFamily("Georgia")).toBe("Georgia");
    expect(canvasFontFamily("Times New Roman")).toBe("Times New Roman");
    expect(canvasFontFamily("Courier New")).toBe("Courier New");
  });

  it("unknown faces fall back to Noto Sans", () => {
    expect(canvasFontFamily("Comic Sans MS")).toBe("Noto Sans");
  });
});
