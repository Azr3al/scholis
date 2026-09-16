// src/components/primitives/theme-toggle.tsx
"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { HalfMoon, Computer, SunLight } from "iconoir-react";
import { cn } from "@/lib/utils";
import {
  type ThemePreference,
  THEME_STORAGE_KEY,
  applyTheme,
  normalizeTheme,
} from "@/lib/sj/theme";
import { playClick } from "@/lib/sound/click-sound";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunLight }[] = [
  { value: "light", label: "Light", Icon: SunLight },
  { value: "dark", label: "Dark", Icon: HalfMoon },
  { value: "system", label: "System", Icon: Computer },
];

export function ThemeToggle({
  className,
  onChange,
}: {
  className?: string;
  onChange?: (pref: ThemePreference) => void;
}) {
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setPref(normalizeTheme(stored ?? document.documentElement.dataset.theme));
  }, []);

  const activeIndex = Math.max(
    0,
    OPTIONS.findIndex(({ value }) => value === pref),
  );

  function choose(next: ThemePreference) {
    if (next === pref) return;
    playClick();
    setPref(next);
    applyTheme(next);
    onChange?.(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        "relative inline-flex w-fit self-start items-center gap-1 rounded-full border border-border bg-surface-elevated p-1",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1 top-1 size-8 rounded-full bg-accent",
          "transition-transform duration-[var(--duration-normal)] ease-[var(--ease-quiet)]",
          "translate-x-[calc(var(--active-index)*(2rem+0.25rem))]",
        )}
        style={{ "--active-index": activeIndex } as CSSProperties}
      />
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          onClick={() => choose(value)}
          className={cn(
            "relative z-10 flex size-8 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
            pref === value
              ? "text-accent-foreground"
              : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <Icon width={16} height={16} aria-hidden />
        </button>
      ))}
    </div>
  );
}
