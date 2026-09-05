// src/lib/ui/overlay-layers.ts
export const OVERLAY_LAYERS = {
  base: 0,
  sticky: 10,
  navigation: 20,
  dropdown: 50,
  banner: 100,
  modalBackdrop: 200,
  modalContent: 210,
  modalDropdown: 220,
  toast: 300,
  emergency: 400,
} as const;

type OverlayLayerName = keyof typeof OVERLAY_LAYERS;

const UTILITY_BY_LAYER: Record<OverlayLayerName, string> = {
  base: "z-base",
  sticky: "z-sticky",
  navigation: "z-navigation",
  dropdown: "z-dropdown",
  banner: "z-banner",
  modalBackdrop: "z-modal-backdrop",
  modalContent: "z-modal-content",
  modalDropdown: "z-modal-dropdown",
  toast: "z-toast",
  emergency: "z-emergency",
};

export function overlayZClass(layer: OverlayLayerName): string {
  return UTILITY_BY_LAYER[layer];
}

const DOCUMENTED_EXCEPTION_FILES = new Set([
  "src/components/find-page/find-page-island.tsx",
]);

/** Bracket z-index utilities allowed outside the standard layer set (see docs/OVERLAY_STACK.md). */
const DOCUMENTED_BRACKET_Z_UTILITIES = new Set([
  // Toast stacking previously used an arbitrary calc utility; keep the token for
  // lint/docs checks even though runtime now uses `z-toast`.
  "z-toast-stack-calc-legacy",
]);

export function isDocumentedOverlayException(relativePath: string): boolean {
  return DOCUMENTED_EXCEPTION_FILES.has(relativePath.replace(/\\/g, "/"));
}

export function isDocumentedBracketZUtility(utility: string): boolean {
  return DOCUMENTED_BRACKET_Z_UTILITIES.has(utility);
}
