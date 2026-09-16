export function parseHostedVideoHref(href: string): string | null {
  if (href.startsWith("video:")) {
    const url = href.slice("video:".length).trim();
    return url || null;
  }
  if (/^https?:\/\//i.test(href) && isLikelyVideoUrl(href)) {
    return href;
  }
  return null;
}

function isLikelyVideoUrl(href: string): boolean {
  if (/github\.com\/[^/]+\/[^/]+\/releases\/download\//i.test(href)) {
    return true;
  }
  if (/raw\.githubusercontent\.com\/.+\.(mp4|webm|mov|m4v)(\?|$)/i.test(href)) {
    return true;
  }
  return false;
}
