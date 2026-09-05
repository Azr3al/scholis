"use client";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import {
  THEME_STORAGE_KEY,
  normalizeTheme,
  type ThemePreference,
} from "@/lib/sj/theme";

function resolvedIsDark(pref: ThemePreference): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function syncColorScheme(pref: ThemePreference): void {
  document.documentElement.style.colorScheme = resolvedIsDark(pref)
    ? "dark"
    : "light";
}

/**
 * BRIDGE ONLY (Phase N removal): mirrors cookie/`data-theme`/`applyTheme` into
 * next-themes so `.sj-content-reset` dark tokens (`globals.css` lines 1225-1271)
 * stay aligned with `.sj-root`. Do not add new next-themes consumers.
 * Removal criteria: docs/UI_TOKEN_MIGRATION.md — zero sj-content-reset consumers.
 */
export function useUnifiedTheme() {
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    const reconcile = () => {
      const current = normalizeTheme(document.documentElement.dataset.theme);
      const nextThemesPref =
        theme !== undefined ? normalizeTheme(theme) : undefined;

      if (nextThemesPref !== current) {
        setTheme(current);
      }
      syncColorScheme(current);
    };

    reconcile();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      reconcile();
    };

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsThemeChange = () => {
      const pref = normalizeTheme(document.documentElement.dataset.theme);
      if (pref !== "system") return;
      if (theme !== undefined && normalizeTheme(theme) !== "system") {
        setTheme("system");
      }
      syncColorScheme("system");
    };

    window.addEventListener("storage", onStorage);
    mq.addEventListener("change", onOsThemeChange);

    return () => {
      window.removeEventListener("storage", onStorage);
      mq.removeEventListener("change", onOsThemeChange);
    };
  }, [setTheme, theme]);

  return {
    syncNextThemes: (pref: ThemePreference) => {
      const normalized = normalizeTheme(pref);
      if (theme !== undefined && normalizeTheme(theme) === normalized) return;
      setTheme(normalized);
    },
  };
}
