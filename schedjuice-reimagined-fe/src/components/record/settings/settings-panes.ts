export type SettingsPaneId = "appearance" | "password";

export const SETTINGS_PANES: { id: SettingsPaneId; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "password", label: "Password" },
];

export const DEFAULT_SETTINGS_PANE: SettingsPaneId = "appearance";

const VALID = new Set<string>(SETTINGS_PANES.map((p) => p.id));

export function isSettingsPaneId(value: string): value is SettingsPaneId {
  return VALID.has(value);
}
