"use client";

import { Tabs } from "@/components/primitives/tabs";
import { ACADEMIC_PANES, type AcademicPaneId } from "./academic-panes";

export function AcademicPaneSwitcher({
  pane,
  onPaneChange,
}: {
  pane: AcademicPaneId;
  onPaneChange: (p: AcademicPaneId) => void;
}) {
  return (
    <Tabs.Root
      value={pane}
      onValueChange={(value) => onPaneChange(value as AcademicPaneId)}
    >
      <Tabs.List className="relative gap-4 border-b border-border pb-0">
        {ACADEMIC_PANES.map((p) => (
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
