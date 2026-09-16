function assertAbsolutePath(path: string): void {
  if (!path.startsWith("/")) {
    throw new Error(`Expected absolute path starting with /, got: ${path}`);
  }
}

export function buildPlatformAdminUrl(domainUrl: string, path: string): string {
  assertAbsolutePath(path);
  const protocol = domainUrl.includes("localhost") ? "http" : "https";
  return `${protocol}://${domainUrl}${path}`;
}

export function buildPlatformAdminLoginRedirectUrl(
  domainUrl: string,
  destinationPath: string,
): string {
  assertAbsolutePath(destinationPath);
  const next = encodeURIComponent(destinationPath);
  return buildPlatformAdminUrl(domainUrl, `/login?next=${next}`);
}

export function redirectToPlatformAdminLogin(
  domainUrl: string,
  destinationPath: string,
): void {
  window.location.href = buildPlatformAdminLoginRedirectUrl(domainUrl, destinationPath);
}
