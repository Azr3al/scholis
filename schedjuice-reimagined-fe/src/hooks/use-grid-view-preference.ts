"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "schedjuice:grid-view:";

function readPreference(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "glide";
  } catch {
    return false;
  }
}

function writePreference(key: string, useGlide: boolean): void {
  try {
    localStorage.setItem(key, useGlide ? "glide" : "original");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Persists whether a page renders the Glide grid vs the legacy table (default: original). */
export function useGridViewPreference(pageKey: string) {
  const storageKey = `${STORAGE_PREFIX}${pageKey}`;
  const [useGlideView, setUseGlideViewState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setUseGlideViewState(readPreference(storageKey));
    setHydrated(true);
  }, [storageKey]);

  const setUseGlideView = useCallback(
    (next: boolean) => {
      setUseGlideViewState(next);
      writePreference(storageKey, next);
    },
    [storageKey],
  );

  const toggleView = useCallback(() => {
    setUseGlideView(!useGlideView);
  }, [useGlideView, setUseGlideView]);

  return {
    useGlideView,
    setUseGlideView,
    toggleView,
    hydrated,
  };
}
