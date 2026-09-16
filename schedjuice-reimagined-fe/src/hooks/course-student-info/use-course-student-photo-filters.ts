"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";

export type StudentPhotoTypeFilter = "all" | "id" | "award";
export type StudentPhotoViewMode = "gallery" | "list";

const VIEW_STORAGE_KEY = "schedjuice:student-info-photo-view";

const parsers = {
  type: parseAsStringEnum<StudentPhotoTypeFilter>(["all", "id", "award"]).withDefault(
    "all",
  ),
  view: parseAsStringEnum<StudentPhotoViewMode>(["gallery", "list"]).withDefault(
    "gallery",
  ),
  q: parseAsString.withDefault(""),
};

function readStoredView(): StudentPhotoViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    return raw === "list" || raw === "gallery" ? raw : null;
  } catch {
    return null;
  }
}

function urlHasExplicitViewParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("view");
}

export function useCourseStudentPhotoFilters() {
  const [raw, setRaw] = useQueryStates(parsers, {
    history: "replace",
    shallow: true,
  });
  const viewPrefApplied = useRef(false);

  useEffect(() => {
    if (viewPrefApplied.current) return;
    viewPrefApplied.current = true;

    if (urlHasExplicitViewParam()) return;

    const stored = readStoredView();
    if (stored && stored !== raw.view) {
      void setRaw({ view: stored });
    }
  }, [raw.view, setRaw]);

  const state = useMemo(
    () => ({
      type: raw.type ?? "all",
      view: raw.view ?? "gallery",
      q: raw.q ?? "",
    }),
    [raw.q, raw.type, raw.view],
  );

  const setType = useCallback(
    (type: StudentPhotoTypeFilter) => setRaw({ type }),
    [setRaw],
  );

  const setView = useCallback(
    (view: StudentPhotoViewMode) => {
      try {
        localStorage.setItem(VIEW_STORAGE_KEY, view);
      } catch {
        /* ignore */
      }
      return setRaw({ view });
    },
    [setRaw],
  );

  const setQ = useCallback((q: string) => setRaw({ q }), [setRaw]);

  return { state, setType, setView, setQ };
}
