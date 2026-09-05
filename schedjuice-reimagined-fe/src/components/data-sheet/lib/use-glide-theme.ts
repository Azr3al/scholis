"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";
import type { Theme } from "@glideapps/glide-data-grid";

import {
  DARK_GLIDE_THEME,
  DARK_LINK_COLORS,
  LIGHT_GLIDE_THEME,
  LIGHT_LINK_COLORS,
  resolveFontFamily,
  setActiveLinkColors,
} from "./glide-theme";

export function useGlideTheme(): Partial<Theme> {
  const { resolvedTheme } = useTheme();

  return useMemo(() => {
    const isDark = resolvedTheme === "dark";
    setActiveLinkColors(isDark ? DARK_LINK_COLORS : LIGHT_LINK_COLORS);
    const base = isDark ? DARK_GLIDE_THEME : LIGHT_GLIDE_THEME;
    // Canvas can't resolve `var(...)`; inject the concrete font family so cell
    // text renders in the right font and scales with font size.
    return { ...base, fontFamily: resolveFontFamily() };
  }, [resolvedTheme]);
}
