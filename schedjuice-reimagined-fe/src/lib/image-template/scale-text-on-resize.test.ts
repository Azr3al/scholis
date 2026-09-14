import { describe, expect, it } from "vitest";
import { applyFontSize, applyInlineText, scaleTextOnResize } from "./scale-text-on-resize";
import type { Layer } from "./types";

const text: Layer = {
  id: "t1",
  type: "text",
  text: "Hi",
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  z: 0,
  fontSize: 24,
};

describe("scaleTextOnResize", () => {
  it("east shrink wraps and grows height without changing fontSize", () => {
    const paragraph: Layer = { ...text, text: "aa bb cc", fontSize: 10, height: 12, y: 20 };
    const next = scaleTextOnResize(
      paragraph,
      { ...paragraph, width: 2 },
      "e",
      (value) => value.length,
    );
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.fontSize).toBe(10);
    expect(next.width).toBe(2);
    expect(next.height).toBe(10 * 1.2 * 3);
    expect(next.y).toBe(20);
    expect(next.x).toBe(0);
  });

  it("west shrink pins the right edge and grows height downward", () => {
    const paragraph: Layer = {
      ...text,
      text: "aa bb cc",
      fontSize: 10,
      x: 10,
      y: 20,
      width: 100,
      height: 12,
    };
    const next = scaleTextOnResize(
      paragraph,
      { ...paragraph, x: 10 + 98, width: 2 },
      "w",
      (value) => value.length,
    );
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.x + next.width).toBe(110);
    expect(next.y).toBe(20);
    expect(next.height).toBe(10 * 1.2 * 3);
    expect(next.fontSize).toBe(10);
  });

  it("east widen unwraps and shrinks height", () => {
    const wrapped: Layer = {
      ...text,
      text: "aa bb cc",
      fontSize: 10,
      width: 2,
      height: 36,
    };
    const next = scaleTextOnResize(
      wrapped,
      { ...wrapped, width: 100 },
      "e",
      (value) => value.length,
    );
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.width).toBe(100);
    expect(next.height).toBe(10 * 1.2);
  });

  it("uses both axes on a corner drag so the handle stays near the pointer", () => {
    const next = scaleTextOnResize(text, { ...text, width: 200, height: 42 }, "se");
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    const factor = Math.hypot(200, 42) / Math.hypot(100, 40);
    expect(next.width).toBeCloseTo(100 * factor);
    expect(next.fontSize).toBeCloseTo(24 * factor);
    expect(next.height).toBeCloseTo(next.fontSize! * 1.2);
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
  });

  it("pins the opposite corner on a northwest drag", () => {
    const next = scaleTextOnResize(text, { ...text, x: -20, y: -10, width: 120, height: 50 }, "nw");
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.x + next.width).toBeCloseTo(100);
    expect(next.y + next.height).toBeCloseTo(40);
  });

  it("does not change fontSize when only width changes", () => {
    const next = scaleTextOnResize(text, { ...text, width: 200 }, "e");
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.fontSize).toBe(24);
  });

  it("does not scale a field token fontSize on east resize", () => {
    const field: Layer = {
      id: "f1",
      type: "field",
      field: "student_name",
      x: 10,
      y: 20,
      width: 200,
      height: 40,
      z: 0,
      fontSize: 24,
    };
    const next = scaleTextOnResize(field, { ...field, width: 150 }, "e");
    expect(next.type).toBe("field");
    if (next.type !== "field") return;
    expect(next.fontSize).toBe(24);
    expect(next.width).toBeGreaterThanOrEqual(150);
  });

  it("does not invent fontSize on a photo resize", () => {
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
    const next = scaleTextOnResize(photo, { ...photo, height: 200 });
    expect(next).toEqual({ ...photo, height: 200 });
    expect("fontSize" in next).toBe(false);
  });
});

describe("applyFontSize", () => {
  it("keeps width and reflows height when the font changes", () => {
    const next = applyFontSize(text, 48);
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.fontSize).toBe(48);
    expect(next.width).toBe(100);
    expect(next.height).toBe(48 * 1.2);
  });

  it("does not treat font points as inches when unitScale is set", () => {
    const field: Layer = {
      id: "f1",
      type: "field",
      field: "registration",
      x: 0.55,
      y: 0.5,
      width: 1.7,
      height: 0.25,
      z: 0,
      fontSize: 14,
      align: "center",
    };
    const withoutUnitScale = applyFontSize(field, 18);
    const withUnitScale = applyFontSize(field, 18, 300);
    expect(withoutUnitScale.type).toBe("field");
    expect(withUnitScale.type).toBe("field");
    if (withoutUnitScale.type !== "field" || withUnitScale.type !== "field") return;
    expect(withUnitScale.fontSize).toBe(18);
    expect(withoutUnitScale.width).toBeGreaterThan(50);
    expect(withUnitScale.width).toBeLessThan(withoutUnitScale.width / 10);
    expect(withUnitScale.x).toBeGreaterThan(withoutUnitScale.x);
  });

  it("keeps height in inches when font size changes on id card text", () => {
    const idText: Layer = {
      id: "t1",
      type: "text",
      text: "Your text",
      x: 0.2,
      y: 2,
      width: 1.7,
      height: (16 * 1.2) / 72,
      z: 0,
      fontSize: 16,
    };
    const withoutUnitScale = applyFontSize(idText, 24);
    const withUnitScale = applyFontSize(idText, 24, 300);
    expect(withUnitScale.type).toBe("text");
    if (withUnitScale.type !== "text") return;
    expect(withUnitScale.height).toBeCloseTo((24 * 1.2) / 72, 4);
    expect(withUnitScale.height).toBeLessThan(1);
    expect(withoutUnitScale.height).toBeGreaterThan(withUnitScale.height * 10);
  });

  it("keeps pixel height when resizing id card text in artboard pixel space", () => {
    const dpi = 300;
    const fontSize = 16;
    const pixelHeight = ((fontSize * 1.2) / 72) * dpi;
    const idText: Layer = {
      id: "t1",
      type: "text",
      text: "Your text",
      x: 60,
      y: 600,
      width: 510,
      height: pixelHeight,
      z: 0,
      fontSize,
    };
    const next = scaleTextOnResize(idText, { ...idText, width: 400 }, "e", undefined, dpi, true);
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.width).toBe(400);
    expect(next.height).toBeCloseTo(pixelHeight, 0);
    expect(next.height).toBeGreaterThan(50);
  });
});

describe("applyInlineText", () => {
  it("keeps fontSize after the copy changes", () => {
    const next = applyInlineText(text, "Hello there", (value) => value.length);
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.fontSize).toBe(24);
    expect(next.text).toBe("Hello there");
    expect(next.width).toBe(100);
  });

  it("hugs extra lines instead of keeping a taller empty box", () => {
    const next = applyInlineText(text, "Hi\nthere");
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.height).toBeCloseTo(24 * 1.2 * 2);
    const tall: Layer = { ...text, height: 80 };
    const hugged = applyInlineText(tall, "Hi\nthere");
    expect(hugged.type).toBe("text");
    if (hugged.type !== "text") return;
    expect(hugged.height).toBeCloseTo(24 * 1.2 * 2);
  });

  it("grows width when a word is wider than the box", () => {
    const next = applyInlineText(text, "Hi Supercalifragilistic", (value) => value.length * 10);
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.width).toBe(200);
  });

  it("grows width for a trailing space when measure drops it", () => {
    const dropTrailing = (value: string) => value.replace(/\s+$/, "").length * 10;
    const narrow: Layer = { ...text, width: 55 };
    const without = applyInlineText(narrow, "Hello", dropTrailing);
    const withSpace = applyInlineText(narrow, "Hello ", dropTrailing);
    expect(without.type).toBe("text");
    expect(withSpace.type).toBe("text");
    if (without.type !== "text" || withSpace.type !== "text") return;
    expect(without.width).toBe(55);
    expect(withSpace.width).toBe(55);
  });

  it("keeps width when copy gets shorter", () => {
    const next = applyInlineText(text, "Hi", (value) => value.length * 10);
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.width).toBe(100);
  });

  it("grows a centered box from the middle", () => {
    const centered: Layer = { ...text, align: "center" };
    const next = applyInlineText(centered, "Supercalifragilistic", (value) => value.length * 10);
    expect(next.type).toBe("text");
    if (next.type !== "text") return;
    expect(next.width).toBe(200);
    expect(next.x).toBe(-50);
  });

  it("stores a template string on a named person layer", () => {
    const person: Layer = {
      id: "n1",
      type: "named_person",
      user_id: 7,
      x: 0,
      y: 0,
      width: 80,
      height: 24,
      z: 0,
    };
    const next = applyInlineText(person, "This award is for {{named person}}");
    expect(next.type).toBe("named_person");
    if (next.type !== "named_person") return;
    expect(next.template).toBe("This award is for {{named person}}");
  });
});
