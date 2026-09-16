"use client";
import { useCallback } from "react";
import { parseAsString, useQueryState } from "nuqs";
import {
  DEFAULT_SECTION,
  isRecordSectionId,
  type RecordSectionId,
} from "./record-sections";

/** Active record section, persisted in the URL as `?section=` (deep-linkable). */
export function useRecordSection() {
  const [raw, setRaw] = useQueryState(
    "section",
    parseAsString.withDefault(DEFAULT_SECTION),
  );
  const section: RecordSectionId = isRecordSectionId(raw) ? raw : DEFAULT_SECTION;
  // Stable identity so consumers can safely memoize on `setSection`.
  const setSection = useCallback(
    (s: RecordSectionId) => {
      void setRaw(s);
    },
    [setRaw],
  );
  return { section, setSection };
}
