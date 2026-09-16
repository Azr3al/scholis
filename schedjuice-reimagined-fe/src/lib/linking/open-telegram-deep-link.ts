/** Validate a Telegram bot web deep link used for account binding. */
export function isTelegramWebDeepLink(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") {
      return false;
    }
    if (parsed.hostname !== "t.me") {
      return false;
    }
    const bot = parsed.pathname.replace(/^\//, "").trim();
    if (!bot) {
      return false;
    }
    const start = parsed.searchParams.get("start")?.trim();
    return Boolean(start);
  } catch {
    return false;
  }
}

export type OpenTelegramDeepLinkOptions = {
  preferAppHandoff?: boolean;
};

/**
 * Open a t.me bot deep link. On mobile, same-tab navigation hands off to the
 * Telegram app more reliably than window.open.
 */
export function openTelegramDeepLink(
  url: string,
  { preferAppHandoff = false }: OpenTelegramDeepLinkOptions = {},
): void {
  const trimmed = url.trim();
  if (!isTelegramWebDeepLink(trimmed)) {
    return;
  }

  if (preferAppHandoff) {
    window.location.href = trimmed;
    return;
  }

  window.open(trimmed, "_blank", "noopener,noreferrer");
}
