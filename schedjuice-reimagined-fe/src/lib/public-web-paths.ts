/** Routes that must work without a logged-in session (mirrors middleware exclusions). */
const PUBLIC_WEB_PREFIXES = [
  "/book-consultation",
  "/join-course",
  "/people",
  "/teachers",
  "/verify",
  "/watch",
  "/terms",
  "/privacy",
  "/public",
  "/attachments",
  "/register",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/unauthorized",
  "/notfound",
] as const;

export function normalizeWebPath(pathname: string): string {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function isPublicWebPath(pathname: string): boolean {
  const normalized = normalizeWebPath(pathname);
  return PUBLIC_WEB_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/** Turn a relative app path or already-absolute URL into a shareable absolute URL. */
export function toAbsoluteWebUrl(pathOrUrl: string, origin: string): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = origin.replace(/\/+$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

/** Anonymous API endpoints that must not trigger auth refresh / login redirect. */
export function isPublicApiUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes("consultation/public/") ||
    url.includes("organizations/public") ||
    url.includes("public/people/") ||
    url.includes("public/teachers/") ||
    url.includes("courses/join/")
  );
}
