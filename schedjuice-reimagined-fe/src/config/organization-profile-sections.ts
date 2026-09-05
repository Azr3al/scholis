import { getObjectFormSchema } from "@/components/auto-form";
import { organizationOwnerEditSchema } from "@/types/organization";

import {
  getRegistryEntry,
  getRegistryFlatKeys,
  ORG_SETTINGS_REGISTRY,
} from "./org-settings-registry";

/**
 * Flat field groups for org owner edit forms. Derived from {@link ORG_SETTINGS_REGISTRY}.
 */
export const ORGANIZATION_PROFILE_EDIT_SECTIONS = ORG_SETTINGS_REGISTRY.filter(
  (e) => !e.customPanel && e.subGroups?.length,
).map((e) => ({
  id: e.id,
  title: e.title,
  description: e.description ?? "",
  keys: getRegistryFlatKeys(e.id),
}));

export function getOrgSchemaSectionKeys(
  sectionId: string,
): readonly string[] | undefined {
  const keys = getRegistryFlatKeys(sectionId);
  return keys.length ? keys : undefined;
}

export function getOrgSchemaSectionMeta(sectionId: string) {
  const entry = getRegistryEntry(sectionId);
  if (!entry) return undefined;
  return { title: entry.title, description: entry.description };
}

const REGISTRY_EXCLUDED_SCHEMA_KEYS = new Set([
  "active_student_id_card_template",
  "active_staff_id_card_template",
  "is_demo",
  "telegram_bot_id",
  "theme",
]);

const schemaKeys = Object.keys(getObjectFormSchema(organizationOwnerEditSchema).shape).filter(
  (k) => !REGISTRY_EXCLUDED_SCHEMA_KEYS.has(k),
);
const sectionKeys: string[] = ORGANIZATION_PROFILE_EDIT_SECTIONS.flatMap((s) => [
  ...s.keys,
]);

if (process.env.NODE_ENV === "development") {
  const missing = schemaKeys.filter((k) => !sectionKeys.includes(k));
  const extra = sectionKeys.filter((k) => !schemaKeys.includes(k));
  const dupes = sectionKeys.filter((k, i) => sectionKeys.indexOf(k) !== i);
  if (missing.length || extra.length || dupes.length) {
    console.error("[organization-profile-sections]", {
      missing,
      extra,
      dupes,
    });
  }
}
