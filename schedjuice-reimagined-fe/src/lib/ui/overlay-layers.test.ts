// src/lib/ui/overlay-layers.test.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OVERLAY_LAYERS,
  isDocumentedBracketZUtility,
  isDocumentedOverlayException,
} from "./overlay-layers";

const CSS_Z_INDEX_TO_LAYER: Record<string, keyof typeof OVERLAY_LAYERS> = {
  base: "base",
  sticky: "sticky",
  navigation: "navigation",
  dropdown: "dropdown",
  banner: "banner",
  "modal-backdrop": "modalBackdrop",
  "modal-content": "modalContent",
  "modal-dropdown": "modalDropdown",
  toast: "toast",
  emergency: "emergency",
};

function parseCssZIndexVars(css: string): Record<string, number> {
  const vars: Record<string, number> = {};
  const re = /--z-index-([\w-]+):\s*(\d+)/g;
  for (const match of Array.from(css.matchAll(re))) {
    vars[match[1]] = Number(match[2]);
  }
  return vars;
}

describe("OVERLAY_LAYERS", () => {
  it("orders modal content above backdrop and banner", () => {
    expect(OVERLAY_LAYERS.modalContent).toBeGreaterThan(OVERLAY_LAYERS.modalBackdrop);
    expect(OVERLAY_LAYERS.modalBackdrop).toBeGreaterThan(OVERLAY_LAYERS.banner);
    expect(OVERLAY_LAYERS.banner).toBeGreaterThan(OVERLAY_LAYERS.dropdown);
    expect(OVERLAY_LAYERS.modalDropdown).toBeGreaterThan(OVERLAY_LAYERS.modalContent);
    expect(OVERLAY_LAYERS.toast).toBeGreaterThan(OVERLAY_LAYERS.modalDropdown);
  });

  it("matches globals.css --z-index-* definitions", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const css = fs.readFileSync(
      path.join(testDir, "../../app/globals.css"),
      "utf8",
    );
    const cssVars = parseCssZIndexVars(css);
    for (const [cssName, layer] of Object.entries(CSS_Z_INDEX_TO_LAYER)) {
      expect(cssVars[cssName], `--z-index-${cssName}`).toBe(OVERLAY_LAYERS[layer]);
    }
  });
});

describe("isDocumentedOverlayException", () => {
  it("allows find-page fillet path only", () => {
    expect(isDocumentedOverlayException("src/components/find-page/find-page-island.tsx")).toBe(true);
    expect(isDocumentedOverlayException("src/components/editor/math-equation-dialog.tsx")).toBe(false);
    expect(isDocumentedOverlayException("src/components/users/user-form.tsx")).toBe(false);
  });
});

describe("isDocumentedBracketZUtility", () => {
  it("rejects ad-hoc var()/calc bracket utilities; allows legacy doc token", () => {
    // Concatenate so Tailwind content scan does not emit these as real utilities
    // (Turbopack's CSS parser rejects arbitrary z-index bracket utilities with var()/calc).
    const toastCalc = ["z-[calc(1000-", "var(--toast-index))]"].join("");
    const keyboardVar = ["z-[var(", "--keyboard-zindex)]"].join("");
    expect(isDocumentedBracketZUtility(toastCalc)).toBe(false);
    expect(isDocumentedBracketZUtility(keyboardVar)).toBe(false);
    expect(isDocumentedBracketZUtility("z-toast-stack-calc-legacy")).toBe(true);
  });
});
