export const SIDEBAR_COOKIE = "sidebar:state";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Reads the persisted desktop sidebar open/collapsed state. Defaults to open. */
export function parseSidebarCookie(cookieString: string): boolean {
  const m = cookieString.match(new RegExp(`(?:^|; )${SIDEBAR_COOKIE}=([^;]+)`));
  if (!m) return true; // default open
  return m[1] !== "false";
}

export function writeSidebarCookie(open: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIDEBAR_COOKIE}=${open}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}
