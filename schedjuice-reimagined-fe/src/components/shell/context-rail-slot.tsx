"use client";

import type { ContextRailConfig } from "./sidebar-context";

export function ContextRailSlot({
  config,
  revision: _revision,
}: {
  config: ContextRailConfig;
  revision: number;
}) {
  const props = config.getProps();
  if (props === null) {
    return null;
  }

  const { Rail } = config;
  return <Rail {...props} />;
}
