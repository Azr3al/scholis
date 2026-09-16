import { describe, expect, it } from "vitest";
import {
  canvasFontCss,
  drawImagePlaceholder,
  editOverlayHalfLeadingPx,
  fitVariableLayer,
  formatVariableLabel,
  isImageLayer,
  isVariableLayer,
  layoutTextLines,
  normalizeLayer,
  photoClipRadiusPx,
  reflowTextLayer,
  textLineHeightPx,
  textStyleFlags,
} from "./layer-style";
import type { Layer } from "./types";

describe("normalizeLayer", () => {
  it("maps legacy fontStyle bold to bold", () => {
    const layer = normalizeLayer({
      id: "t1",
      type: "text",
      text: "Hi",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      z: 0,
      fontStyle: "bold",
    });
    expect(layer.type).toBe("text");
    if (layer.type === "text") expect(layer.bold).toBe(true);
  });
});

describe("canvasFontCss", () => {
  it("includes italic and bold in the font string", () => {
    const layer: Layer = {
      id: "t1",
      type: "text",
      text: "Hi",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      z: 0,
      fontSize: 18,
      fontFamily: "Fraunces",
      bold: true,
      italic: true,
    };
    expect(canvasFontCss(layer, 1)).toBe('italic bold 18px "Fraunces", sans-serif');
  });
});

describe("photoClipRadiusPx", () => {
  it("scales borderRadiusPt for ID-card inches", () => {
    const layer: Layer = {
      id: "p1",
      type: "photo",
      photoKind: "id_image",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      z: 0,
      borderRadiusPt: 8,
    };
    expect(photoClipRadiusPx(layer, 300)).toBeCloseTo(8 * (300 / 72));
  });
});

describe("editOverlayHalfLeadingPx", () => {
  it("is half the extra CSS line box above a canvas top-baseline", () => {
    expect(textLineHeightPx(40)).toBe(48);
    expect(editOverlayHalfLeadingPx(40)).toBe(4);
  });
});

describe("layoutTextLines", () => {
  it("keeps hard line breaks and wraps on spaces", () => {
    expect(layoutTextLines("a\nb", 1000, (value) => value.length, 10)).toEqual(["a", "b"]);
    expect(layoutTextLines("aa bb cc", 2, (value) => value.length, 10)).toEqual(["aa", "bb", "cc"]);
  });

  it("does not split a word that is wider than the box", () => {
    expect(layoutTextLines("Supercalifragilistic", 5, (value) => value.length, 10)).toEqual([
      "Supercalifragilistic",
    ]);
  });

  it("wraps a variable chip using glyph width plus pad, not raw glyphs", () => {
    // fontSize 10 → pad.x = max(4, 2.2) = 4; "{{student_name}}" glyph 16 + 8 pad = 24
    // "Hello " = 6; glyph-only line = 22; with chip = 30. maxWidth 25 fits glyphs, not chip.
    expect(layoutTextLines("Hello {{student_name}}", 25, (value) => value.length, 10)).toEqual([
      "Hello ",
      "{{student_name}}",
    ]);
  });
});

describe("reflowTextLayer", () => {
  const base: Layer = {
    id: "t1",
    type: "text",
    text: "aa bb cc",
    x: 10,
    y: 20,
    width: 100,
    height: 24,
    z: 0,
    fontSize: 10,
  };
  const measure = (value: string) => value.length;

  it("wraps to width and grows height downward", () => {
    const next = reflowTextLayer({ ...base, width: 2 }, measure, "left");
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.width).toBe(2);
    expect(next.height).toBe(10 * 1.2 * 3);
    expect(next.x).toBe(10);
    expect(next.y).toBe(20);
    expect(next.fontSize).toBe(10);
  });

  it("grows width for an overflow word and pins left", () => {
    const next = reflowTextLayer(
      { ...base, text: "Supercalifragilistic", width: 5 },
      measure,
      "left",
    );
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.width).toBe(20);
    expect(next.x).toBe(10);
  });

  it("pins the right edge when pin is right", () => {
    const next = reflowTextLayer(
      { ...base, text: "Supercalifragilistic", width: 5, x: 10 },
      measure,
      "right",
    );
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.width).toBe(20);
    expect(next.x + next.width).toBe(15);
  });
});

describe("variable layers", () => {
  it("marks field and named_person as tokens, not free text", () => {
    const field: Layer = {
      id: "f1",
      type: "field",
      field: "student_name",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      z: 0,
    };
    const person: Layer = {
      id: "n1",
      type: "named_person",
      user_id: 1,
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      z: 0,
    };
    const text: Layer = {
      id: "t1",
      type: "text",
      text: "Hi",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      z: 0,
    };
    expect(isVariableLayer(field)).toBe(true);
    expect(isVariableLayer(person)).toBe(true);
    expect(isVariableLayer(text)).toBe(false);
    expect(formatVariableLabel(field)).toBe("{{student_name}}");
    expect(formatVariableLabel(person)).toBe("{{named_person}}");
    expect(formatVariableLabel(text)).toBeNull();
  });

  it("grows a field box so the token chip is not clipped", () => {
    const field: Layer = {
      id: "f1",
      type: "field",
      field: "student_name",
      x: 0,
      y: 0,
      width: 80,
      height: 20,
      z: 0,
      fontSize: 24,
    };
    const fitted = fitVariableLayer(field);
    expect(fitted.type).toBe("field");
    if (fitted.type !== "field") return;
    expect(fitted.width).toBeGreaterThan(80);
    expect(fitted.height).toBeGreaterThanOrEqual(24 * 1.2);
    expect(fitted.fontSize).toBe(24);
  });

  it("shrinks a field box that is wider than the copy", () => {
    const field: Layer = {
      id: "f1",
      type: "field",
      field: "student_name",
      template: "Hi {{student_name}}",
      x: 0,
      y: 0,
      width: 800,
      height: 80,
      z: 0,
      fontSize: 20,
    };
    const fitted = fitVariableLayer(field);
    expect(fitted.type).toBe("field");
    if (fitted.type !== "field") return;
    expect(fitted.width).toBe(800);
    expect(fitted.height).toBeLessThan(80);
  });
});

describe("image layers", () => {
  it("treats photo, signature, and qr as image layers, not text fields", () => {
    const photo: Layer = {
      id: "p1",
      type: "photo",
      photoKind: "award_image",
      x: 0,
      y: 0,
      width: 80,
      height: 100,
      z: 0,
    };
    const signature: Layer = {
      id: "s1",
      type: "signature",
      bind: { kind: "mt" },
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      z: 0,
    };
    const field: Layer = {
      id: "f1",
      type: "field",
      field: "student_name",
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      z: 0,
    };
    expect(isImageLayer(photo)).toBe(true);
    expect(isImageLayer(signature)).toBe(true);
    expect(
      isImageLayer({ id: "q1", type: "qr", x: 0, y: 0, width: 40, height: 40, z: 0 }),
    ).toBe(true);
    expect(isImageLayer(field)).toBe(false);
  });

  it("paints a framed image glyph instead of a text label", () => {
    const ops: string[] = [];
    const ctx = {
      fillRect: () => ops.push("fill"),
      strokeRect: () => ops.push("frame"),
      beginPath: () => ops.push("path"),
      arc: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => ops.push("stroke"),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
    drawImagePlaceholder(ctx, { x: 0, y: 0, width: 80, height: 60 });
    expect(ops).toContain("fill");
    expect(ops).toContain("frame");
    expect(ops).toContain("path");
    expect(ops).not.toContain("fillText");
  });
});

describe("textStyleFlags", () => {
  it("treats underline as independent of bold", () => {
    expect(
      textStyleFlags({
        id: "t1",
        type: "text",
        text: "Hi",
        x: 0,
        y: 0,
        width: 80,
        height: 24,
        z: 0,
        bold: true,
        underline: true,
      }),
    ).toEqual({ bold: true, italic: false, underline: true });
  });
});
