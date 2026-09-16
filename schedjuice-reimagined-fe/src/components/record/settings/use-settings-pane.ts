"use client";

import { useCallback } from "react";
import { parseAsString, useQueryState } from "nuqs";
import {
  DEFAULT_SETTINGS_PANE,
  isSettingsPaneId,
  type SettingsPaneId,
} from "./settings-panes";

export function useSettingsPane() {
  const [raw, setRaw] = useQueryState(
    "pane",
    parseAsString.withDefault(DEFAULT_SETTINGS_PANE),
  );
  const pane: SettingsPaneId = isSettingsPaneId(raw)
    ? raw
    : DEFAULT_SETTINGS_PANE;
  const setPane = useCallback(
    (next: SettingsPaneId) => {
      void setRaw(next);
    },
    [setRaw],
  );
  return { pane, setPane };
}
