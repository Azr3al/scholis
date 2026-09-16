"use client";

import { useCallback, useEffect, useState } from "react";

import type { SheetDensity, SheetFontSize } from "../types";

export interface DisplaySettings {
  density: SheetDensity;
  fontSize: SheetFontSize;
}

const DEFAULTS: DisplaySettings = {
  density: "comfortable",
  fontSize: "medium",
};

const VALID_DENSITIES = new Set<SheetDensity>([
  "compact",
  "comfortable",
  "spacious",
]);
const VALID_FONT_SIZES = new Set<SheetFontSize>([
  "tiny",
  "small",
  "medium",
  "large",
  "extraLarge",
  "huge",
]);

function readSettings(key: string): DisplaySettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
    const density = VALID_DENSITIES.has(parsed.density as SheetDensity)
      ? (parsed.density as SheetDensity)
      : DEFAULTS.density;
    const fontSize = VALID_FONT_SIZES.has(parsed.fontSize as SheetFontSize)
      ? (parsed.fontSize as SheetFontSize)
      : DEFAULTS.fontSize;
    return { density, fontSize };
  } catch {
    return null;
  }
}

function writeSettings(key: string, settings: DisplaySettings): void {
  localStorage.setItem(key, JSON.stringify(settings));
}

export function useDisplaySettings(persistKey: string) {
  const key = `data-sheet:display:${persistKey}`;
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULTS);

  useEffect(() => {
    const stored = readSettings(key);
    if (stored) setSettings(stored);
  }, [key]);

  const setDensity = useCallback(
    (density: SheetDensity) => {
      setSettings((prev) => {
        const next = { ...prev, density };
        writeSettings(key, next);
        return next;
      });
    },
    [key],
  );

  const setFontSize = useCallback(
    (fontSize: SheetFontSize) => {
      setSettings((prev) => {
        const next = { ...prev, fontSize };
        writeSettings(key, next);
        return next;
      });
    },
    [key],
  );

  return {
    density: settings.density,
    setDensity,
    fontSize: settings.fontSize,
    setFontSize,
  };
}
