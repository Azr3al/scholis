import { ORGANIZATION_PROFILE_EDIT_SECTIONS } from "@/config/organization-profile-sections";

function collectDirtyTopLevelKeys(
  dirty: unknown,
  prefix = "",
): Set<string> {
  const keys = new Set<string>();
  if (dirty === true) {
    if (prefix) {
      keys.add(prefix.split(".")[0] ?? prefix);
    }
    return keys;
  }
  if (!dirty || typeof dirty !== "object") return keys;

  for (const [key, value] of Object.entries(dirty as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === true) {
      keys.add(path.split(".")[0] ?? path);
    } else if (value && typeof value === "object") {
      for (const nested of Array.from(collectDirtyTopLevelKeys(value, path))) {
        keys.add(nested);
      }
    }
  }
  return keys;
}

/** Map react-hook-form dirtyFields to organization schema section ids. */
export function getDirtySchemaSectionIds(
  dirtyFields: unknown,
): string[] {
  const dirtyKeys = collectDirtyTopLevelKeys(dirtyFields);
  if (dirtyKeys.size === 0) return [];

  return ORGANIZATION_PROFILE_EDIT_SECTIONS.filter((section) =>
    section.keys.some((key) => dirtyKeys.has(key)),
  ).map((section) => section.id);
}
