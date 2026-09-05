"use client";

import { useUnifiedTheme } from "./use-unified-theme";

/** Mounts global data-theme ↔ next-themes reconciliation (App Shell spec §4.3). */
export function ThemeSync() {
  useUnifiedTheme();
  return null;
}
