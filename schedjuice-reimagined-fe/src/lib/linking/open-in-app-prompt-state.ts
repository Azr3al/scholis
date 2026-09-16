import { resolveUniversalLinkHost } from "@/config/universal-link-registry";

const OPEN_IN_APP_PROMPT_DISMISSED_KEY =
  "schedjuice.openInAppPrompt.dismissed";

export function isOpenInAppPromptDismissed(): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }
  return sessionStorage.getItem(OPEN_IN_APP_PROMPT_DISMISSED_KEY) === "1";
}

export function dismissOpenInAppPromptForSession(): void {
  sessionStorage.setItem(OPEN_IN_APP_PROMPT_DISMISSED_KEY, "1");
}

export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function isColdDocumentNavigation(): boolean {
  if (typeof performance === "undefined") {
    return true;
  }
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type === "navigate";
}

export function isRegisteredUniversalLinkHost(host: string): boolean {
  return resolveUniversalLinkHost(host) !== null;
}

const WEB_AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

/** Auth and OAuth callback routes must stay in the browser on mobile web. */
export function isWebAuthPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (WEB_AUTH_PATHS.has(normalized)) {
    return true;
  }
  return Array.from(WEB_AUTH_PATHS).some((authPath) =>
    normalized.startsWith(`${authPath}/`),
  );
}
