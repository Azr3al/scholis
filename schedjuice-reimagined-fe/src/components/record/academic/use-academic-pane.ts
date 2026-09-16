"use client";

import { useCallback } from "react";
import { parseAsString, useQueryState } from "nuqs";
import {
  DEFAULT_ACADEMIC_PANE,
  isAcademicPaneId,
  type AcademicPaneId,
} from "./academic-panes";

export function useAcademicPane() {
  const [raw, setRaw] = useQueryState(
    "pane",
    parseAsString.withDefault(DEFAULT_ACADEMIC_PANE),
  );
  const pane: AcademicPaneId = isAcademicPaneId(raw) ? raw : DEFAULT_ACADEMIC_PANE;
  const setPane = useCallback(
    (next: AcademicPaneId) => {
      void setRaw(next);
    },
    [setRaw],
  );
  return { pane, setPane };
}
