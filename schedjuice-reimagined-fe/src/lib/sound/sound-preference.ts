"use client";

import { useCallback, useEffect, useState } from "react";

const UI_SOUNDS_STORAGE_KEY = "sj:ui-sounds";
const UI_SOUNDS_VOLUME_STORAGE_KEY = "sj:ui-sounds-volume";
const UI_SOUNDS_CHANGED_EVENT = "sj:ui-sounds-changed";

const DEFAULT_UI_SOUND_VOLUME = 100;

function clampVolumePercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SOUND_VOLUME;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function canUseLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function readFromStorage(): boolean {
  if (!canUseLocalStorage()) return true;
  try {
    const raw = localStorage.getItem(UI_SOUNDS_STORAGE_KEY);
    if (raw === "off") return false;
    if (raw === "on") return true;
    return true;
  } catch {
    return true;
  }
}

let cachedEnabled: boolean | null = null;

function getCachedEnabled(): boolean {
  if (cachedEnabled === null) {
    cachedEnabled = readFromStorage();
  }
  return cachedEnabled;
}

export function isUiSoundEnabled(): boolean {
  return getCachedEnabled();
}

function setUiSoundEnabled(enabled: boolean): void {
  cachedEnabled = enabled;
  if (canUseLocalStorage()) {
    try {
      localStorage.setItem(UI_SOUNDS_STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // Quota / private mode — in-memory cache still works for the session.
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UI_SOUNDS_CHANGED_EVENT, { detail: { enabled } }),
    );
  }
}

export function useUiSoundEnabled(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(getCachedEnabled());

    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === "boolean") {
        setEnabled(detail.enabled);
      } else {
        setEnabled(getCachedEnabled());
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === UI_SOUNDS_STORAGE_KEY || event.key === null) {
        cachedEnabled = null;
        setEnabled(getCachedEnabled());
      }
    };

    window.addEventListener(UI_SOUNDS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(UI_SOUNDS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const set = useCallback((value: boolean) => {
    setUiSoundEnabled(value);
  }, []);

  return [enabled, set];
}

function readVolumeFromStorage(): number {
  if (!canUseLocalStorage()) return DEFAULT_UI_SOUND_VOLUME;
  try {
    const raw = localStorage.getItem(UI_SOUNDS_VOLUME_STORAGE_KEY);
    if (raw === null) return DEFAULT_UI_SOUND_VOLUME;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_UI_SOUND_VOLUME;
    return clampVolumePercent(parsed);
  } catch {
    return DEFAULT_UI_SOUND_VOLUME;
  }
}

let cachedVolumePercent: number | null = null;

function getCachedVolumePercent(): number {
  if (cachedVolumePercent === null) {
    cachedVolumePercent = readVolumeFromStorage();
  }
  return cachedVolumePercent;
}

/** Returns a 0–1 multiplier for the click engine. */
export function getUiSoundVolume(): number {
  return getCachedVolumePercent() / 100;
}

function setUiSoundVolume(percent: number): void {
  const clamped = clampVolumePercent(percent);
  cachedVolumePercent = clamped;
  if (canUseLocalStorage()) {
    try {
      localStorage.setItem(UI_SOUNDS_VOLUME_STORAGE_KEY, String(clamped));
    } catch {
      // Quota / private mode — in-memory cache still works for the session.
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(UI_SOUNDS_CHANGED_EVENT, { detail: { volume: clamped } }),
    );
  }
}

export function useUiSoundVolume(): [number, (percent: number) => void] {
  const [volume, setVolume] = useState(DEFAULT_UI_SOUND_VOLUME);

  useEffect(() => {
    setVolume(getCachedVolumePercent());

    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ volume?: number }>).detail;
      if (typeof detail?.volume === "number") {
        setVolume(clampVolumePercent(detail.volume));
      } else {
        setVolume(getCachedVolumePercent());
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === UI_SOUNDS_VOLUME_STORAGE_KEY || event.key === null) {
        cachedVolumePercent = null;
        setVolume(getCachedVolumePercent());
      }
    };

    window.addEventListener(UI_SOUNDS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(UI_SOUNDS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const set = useCallback((value: number) => {
    setUiSoundVolume(value);
  }, []);

  return [volume, set];
}
