export function getFindPageShortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl K";
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
  const isApple =
    /Mac|iPhone|iPad|iPod/i.test(platform) ||
    /Mac|iPhone|iPad|iPod/i.test(nav.userAgent);
  return isApple ? "⌘K" : "Ctrl K";
}

/** Welcome-dialog sentence fragment before the shortcut token. */
export function getFindPageWelcomeShortcutHint(): string {
  const label = getFindPageShortcutLabel();
  if (label.startsWith("⌘")) {
    return `You can also press ${label} on a Mac or Ctrl+K on Windows.`;
  }
  return `You can also press ${label} on Windows or ⌘K on a Mac.`;
}
