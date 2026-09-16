"use client";
import { ThemeToggle } from "@/components/primitives/theme-toggle";
import { useUnifiedTheme } from "./use-unified-theme";

/** The 3-way theme control mounted in the shell header; drives data-theme + next-themes. */
export function ThemeControl({ className }: { className?: string }) {
  const { syncNextThemes } = useUnifiedTheme();
  return <ThemeToggle className={className} onChange={syncNextThemes} />;
}
