"use client";

import { Tabs } from "@/components/primitives/tabs";
import { SETTINGS_PANES, type SettingsPaneId } from "./settings-panes";

export function SettingsPaneSwitcher({
  pane,
  onPaneChange,
}: {
  pane: SettingsPaneId;
  onPaneChange: (p: SettingsPaneId) => void;
}) {
  return (
    <Tabs.Root
      value={pane}
      onValueChange={(value) => onPaneChange(value as SettingsPaneId)}
    >
      <Tabs.List className="relative gap-4 border-b border-border pb-0">
        {SETTINGS_PANES.map((p) => (
          <Tabs.Tab
            key={p.id}
            value={p.id}
            className="relative h-10 rounded-none px-0 pb-3 data-[active]:text-text-primary"
          >
            {p.label}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator className="!bottom-0 !top-auto !z-10 !h-0.5 !rounded-none !bg-brand !mix-blend-normal" />
      </Tabs.List>
    </Tabs.Root>
  );
}
