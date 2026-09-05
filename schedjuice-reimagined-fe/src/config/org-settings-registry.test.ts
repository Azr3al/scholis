import { describe, expect, it } from "vitest";

import { getObjectFormSchema } from "@/components/auto-form";
import { organizationOwnerEditSchema } from "@/types/organization";

import {
  ORG_SETTINGS_REGISTRY,
  getRegistryFlatKeys,
} from "./org-settings-registry";

/** Read-only or custom-panel fields excluded from flat schema section keys. */
const REGISTRY_EXCLUDED_SCHEMA_KEYS = new Set([
  "active_student_id_card_template",
  "active_staff_id_card_template",
  "is_demo",
  "telegram_bot_id",
  "theme",
]);

describe("org-settings-registry", () => {
  it("assigns every owner-edit schema key exactly once", () => {
    const schemaKeys = Object.keys(
      getObjectFormSchema(organizationOwnerEditSchema).shape,
    ).filter((k) => !REGISTRY_EXCLUDED_SCHEMA_KEYS.has(k));
    const registryKeys = ORG_SETTINGS_REGISTRY.flatMap((e) =>
      e.subGroups ? e.subGroups.flatMap((g) => [...g.keys]) : [],
    );
    const missing = schemaKeys.filter((k) => !registryKeys.includes(k));
    const extra = registryKeys.filter((k) => !schemaKeys.includes(k));
    const dupes = registryKeys.filter((k, i) => registryKeys.indexOf(k) !== i);
    expect({ missing, extra, dupes }).toEqual({ missing: [], extra: [], dupes: [] });
  });

  it("maps is_wd_we_course_types_enabled to courses not reports", () => {
    expect(getRegistryFlatKeys("courses")).toContain("is_wd_we_course_types_enabled");
    expect(getRegistryFlatKeys("reports")).not.toContain("is_wd_we_course_types_enabled");
  });
});
