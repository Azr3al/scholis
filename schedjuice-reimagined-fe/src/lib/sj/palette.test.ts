import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { DARK, LIGHT, RAW } from "./palette";

describe("light theme contrast (DESIGN.md §5)", () => {
  it("body text (terminal on cream) is AAA", () => {
    expect(contrastRatio(RAW.terminal, RAW.pixelWhite)).toBeGreaterThanOrEqual(7);
  });
  it("secondary text (circuit-board on cream) is AAA", () => {
    expect(contrastRatio(RAW.circuitBoard, RAW.pixelWhite)).toBeGreaterThanOrEqual(7);
  });
  it("muted text (warm-600 on cream) is AA body", () => {
    expect(contrastRatio(LIGHT.textMuted, LIGHT.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("button label (white on accent) is AA body", () => {
    expect(contrastRatio(LIGHT.accentForeground, LIGHT.accent)).toBeGreaterThanOrEqual(4.5);
  });
  it("inline link (accent on cream) is AA body", () => {
    expect(contrastRatio(LIGHT.accent, LIGHT.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("soft brand on cream is decorative-only (fails AA body)", () => {
    expect(contrastRatio(RAW.dataGreen, RAW.pixelWhite)).toBeLessThan(4.5);
  });
  it("warning fill on cream fails AA body (use warningForeground for text)", () => {
    expect(contrastRatio(RAW.warning, RAW.pixelWhite)).toBeLessThan(4.5);
  });
  it("warning foreground on cream is AA body", () => {
    expect(contrastRatio(RAW.warningForeground, RAW.pixelWhite)).toBeGreaterThanOrEqual(4.5);
  });
  it("success on cream is AA body", () => {
    expect(contrastRatio(RAW.success, RAW.pixelWhite)).toBeGreaterThanOrEqual(4.5);
  });
  it("white on success is AA body", () => {
    expect(contrastRatio(RAW.successForeground, RAW.success)).toBeGreaterThanOrEqual(4.5);
  });
  it("status blue on cream is AA body", () => {
    expect(contrastRatio(RAW.statusBlue, RAW.pixelWhite)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dark theme contrast (DESIGN.md §16)", () => {
  it("body text on dark surface is AAA", () => {
    expect(contrastRatio(DARK.textPrimary, DARK.surface)).toBeGreaterThanOrEqual(7);
  });
  it("link/accent-as-text on dark surface is AA body", () => {
    expect(contrastRatio(DARK.accent, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("button label on dark accent is AA body", () => {
    expect(contrastRatio(DARK.accentForeground, DARK.accent)).toBeGreaterThanOrEqual(4.5);
  });
  it("warning foreground on dark surface is AA body", () => {
    expect(contrastRatio(DARK.warningForeground, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("success on dark surface is AA body", () => {
    expect(contrastRatio(DARK.success, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("success foreground on dark success fill is AA body", () => {
    expect(contrastRatio(DARK.successForeground, DARK.success)).toBeGreaterThanOrEqual(4.5);
  });
});
