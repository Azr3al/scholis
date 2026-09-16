function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function extractFromJoinPath(rawPath: string): string | null {
  const normalized = rawPath.replace(/^\/+/, "");
  const joinCoursePrefix = "join-course/";
  if (normalized.startsWith(joinCoursePrefix)) {
    const segment = normalized.slice(joinCoursePrefix.length);
    if (!segment) return null;
    return decodeSegment(segment);
  }
  if (!normalized.startsWith("join/")) return null;
  const segment = normalized.slice("join/".length);
  if (!segment) return null;
  return decodeSegment(segment);
}

/**
 * Normalizes user paste/input into a join code string for `courses/join/{code}`.
 * Accepts plain codes, path segments, and full invite URLs.
 */
export function parseJoinCodeFromUserInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const path = u.pathname.replace(/^\/+/, "");
      const extracted = extractFromJoinPath(path);
      if (extracted !== null) return extracted;
      if (path.startsWith("join/") && path.slice("join/".length) === "") {
        return null;
      }
      return trimmed;
    } catch {
      /* invalid URL — fall through to bare-path / literal handling */
    }
  }

  const normalizedBare = trimmed.replace(/^\/+/, "");
  const fromBarePath = extractFromJoinPath(normalizedBare);
  if (fromBarePath !== null) return fromBarePath;

  if (
    normalizedBare.startsWith("join/") &&
    normalizedBare.slice("join/".length) === ""
  ) {
    return null;
  }

  return trimmed;
}
