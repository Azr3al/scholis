/** Client-side YouTube URL parsing (preview only; backend is source of truth). */

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const PATH_PATTERNS = [
  /(?:youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
];

export function extractYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return id && VIDEO_ID_RE.test(id) ? id : null;
  }

  if (host.endsWith("youtube.com")) {
    for (const key of ["v", "vi"]) {
      const value = parsed.searchParams.get(key);
      if (value && VIDEO_ID_RE.test(value)) return value;
    }
    const path = `youtube.com${parsed.pathname}`;
    for (const pattern of PATH_PATTERNS) {
      const match = path.match(pattern);
      if (match?.[1] && VIDEO_ID_RE.test(match[1])) return match[1];
    }
  }

  return null;
}

export function youTubeThumbnailUrl(videoId: string, quality: "hqdefault" | "mqdefault" = "hqdefault") {
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}
