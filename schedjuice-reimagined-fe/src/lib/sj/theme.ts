// src/lib/sj/theme.ts
// Shared (no "use client"): the server RootLayout calls normalizeTheme(), while
// applyTheme() is only invoked client-side (from the theme toggle) and guards on `document`.

const THEME_COOKIE = "theme";
/** Org brand colors JSON — must not share THEME_COOKIE (mode preference). */
export const ORG_THEME_COOKIE = "org-theme";
export const THEME_STORAGE_KEY = "sj-theme";

export type ThemePreference = "light" | "dark" | "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function normalizeTheme(value: unknown): ThemePreference {
  if (typeof value === "string" && value.startsWith("{")) return "system";
  return isThemePreference(value) ? value : "system";
}

function resolveThemeMode(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return pref;
}

function clearThemeSwitchingFlag(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      delete document.documentElement.dataset.sjThemeSwitching;
    });
  });
}

/** Writes the preference to cookie + localStorage and applies it to <html>. */
export function applyTheme(pref: ThemePreference): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.sjThemeSwitching = "1";
  el.dataset.theme = pref;
  const resolved = resolveThemeMode(pref);
  el.style.colorScheme = resolved;
  el.classList.toggle("dark", resolved === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage may be unavailable (private mode) */
  }
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=${oneYear}; samesite=lax`;
  clearThemeSwitchingFlag();
}
