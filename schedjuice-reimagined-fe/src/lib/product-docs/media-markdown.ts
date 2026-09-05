export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

const VIDEO_LINE_RE = /^@\[([^\]]*)\]\(video:([^)]+)\)\s*$/;
const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export type ParsedMediaLine =
  | { type: "video"; title: string; url: string }
  | { type: "image"; alt: string; url: string };

export function parseMediaLine(line: string): ParsedMediaLine | null {
  const video = line.match(VIDEO_LINE_RE);
  if (video) {
    return { type: "video", title: video[1], url: video[2].trim() };
  }
  const image = line.match(IMAGE_LINE_RE);
  if (image) {
    return { type: "image", alt: image[1], url: image[2].trim() };
  }
  return null;
}

export function classifyMediaFile(file: File): "video" | "image" | null {
  if (file.type.startsWith("video/")) {
    return file.size <= MAX_VIDEO_BYTES ? "video" : null;
  }
  if (ALLOWED_IMAGE_TYPES.has(file.type)) {
    return file.size <= MAX_IMAGE_BYTES ? "image" : null;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
