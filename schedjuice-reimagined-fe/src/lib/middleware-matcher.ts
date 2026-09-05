/**
 * Next.js `middleware.ts` `config.matcher` pattern.
 * Keep this string in sync with `export const config` in `src/middleware.ts`
 * (Next requires a statically analyzable matcher literal).
 */
export const MIDDLEWARE_MATCHER =
  "/((?!api|_next/|favicon.ico|login|images|svg-icons|fonts|changelog|unauthorized|notfound|terms|privacy|public|reset-password|forgot-password|join-course|book-consultation|register|watch|people|teachers|verify|attachments|\\.well-known|.*\\.[\\w]+$).*)";

export function middlewareRunsOnPath(pathname: string): boolean {
  return new RegExp(`^${MIDDLEWARE_MATCHER}$`).test(pathname);
}
