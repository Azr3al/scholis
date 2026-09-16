import type { accountType } from "@/types/user";

export function normalizeProfileImagePath(
  url: string | null | undefined,
): string | null {
  if (!url || !url.trim()) return null;
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    }
  } catch {
    /* fall through */
  }
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function mergeAccountPreservingProfileImage(
  prev: accountType | undefined,
  next: accountType,
): accountType {
  if (!prev) return next;
  const merged = { ...next };
  if (prev.profile_image && next.profile_image) {
    const prevPath = normalizeProfileImagePath(prev.profile_image);
    const nextPath = normalizeProfileImagePath(next.profile_image);
    if (prevPath && nextPath && prevPath === nextPath) {
      merged.profile_image = prev.profile_image;
    }
  }
  if (prev.cover_image && next.cover_image) {
    const prevPath = normalizeProfileImagePath(prev.cover_image);
    const nextPath = normalizeProfileImagePath(next.cover_image);
    if (prevPath && nextPath && prevPath === nextPath) {
      merged.cover_image = prev.cover_image;
    }
  }
  return merged;
}
