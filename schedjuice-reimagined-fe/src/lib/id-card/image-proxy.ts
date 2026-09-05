/** Hostnames trusted for server-side image proxy (mirrors next.config.js remotePatterns). */
const ALLOWED_IMAGE_HOSTS = new Set([
  "github.com",
  "teachersucenter.com",
  "avatars.githubusercontent.com",
  "127.0.0.1",
  "localhost",
  "suconnect.s3.ap-southeast-1.amazonaws.com",
  "suconnect.s3.amazonaws.com",
  "schedjuice-dev.sgp1.digitaloceanspaces.com",
  "schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
]);

export function isAllowedImageHost(hostname: string): boolean {
  return ALLOWED_IMAGE_HOSTS.has(hostname.toLowerCase());
}

export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return isAllowedImageHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function toAbsoluteImageUrl(
  url: string,
  origin?: string,
): string | null {
  if (url.startsWith("data:")) return url;
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    if (origin) {
      return new URL(url, origin).href;
    }
    return null;
  } catch {
    return null;
  }
}

export function imageProxyUrl(absoluteUrl: string): string {
  return `/image-proxy?url=${encodeURIComponent(absoluteUrl)}`;
}
