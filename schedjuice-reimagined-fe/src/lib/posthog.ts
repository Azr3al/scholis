import posthog from "posthog-js";

const EXCLUDED_PREFIXES = [
  "/internal",
  "/components",
  "/login",
  "/register",
  "/verify",
  "/join-course",
];

export function normalizePath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f-]{36}$/i.test(segment)) return ":id";
      return segment;
    })
    .join("/");
}

export function shouldTrackPage(pathname: string): boolean {
  if (
    EXCLUDED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }
  if (pathname.startsWith("/help") || pathname.startsWith("/platform/docs")) {
    return true;
  }
  // Internal app routes (route groups like `(internal)` are not part of URL pathnames).
  return !pathname.startsWith("/public");
}

export function initPostHog(): typeof posthog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  if (!key || !host) return null;
  if ((posthog as { __loaded?: boolean }).__loaded) return posthog;

  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: "localStorage+cookie",
  });
  return posthog;
}

export function capturePageview(
  pathname: string,
  properties: Record<string, unknown>,
): void {
  const client = initPostHog();
  if (!client || !shouldTrackPage(pathname)) return;

  client.capture("$pageview", {
    normalized_path: normalizePath(pathname),
    ...properties,
  });
}
