import { describe, expect, it } from "vitest";

import { getObjectFormSchema } from "@/components/auto-form";
import { organizationOwnerEditSchema } from "@/types/organization";

import { role, type accountType } from "@/types/user";

import {
  ORG_SETTINGS_REGISTRY,
  getRegistryEntry,
  getRegistryFlatKeys,
  visibleOrgSubGroups,
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

  it("includes single mobile device policy under login-domains Access", () => {
    expect(getRegistryFlatKeys("login-domains")).toContain(
      "is_single_mobile_device_enabled",
    );
    const mobileSubGroup = getRegistryEntry("login-domains")?.subGroups?.find(
      (g) => g.id === "mobile-sign-in",
    );
    expect(mobileSubGroup?.title).toBe("Mobile sign-in");
    expect(mobileSubGroup?.description).toMatch(/one phone or tablet app at a time/);
  });

  it("hides mobile sign-in subgroup without mobile_device_policy.configure", () => {
    const entry = getRegistryEntry("login-domains");
    expect(entry?.subGroups).toBeDefined();
    const viewer = {
      id: 1,
      roles: [role.admin],
      permissions: ["org.configure"],
    } as accountType;
    const ctx = { mode: "tenant" as const, viewer, tenant: null };
    const visible = visibleOrgSubGroups(entry!.subGroups!, ctx);
    expect(visible.map((g) => g.id)).not.toContain("mobile-sign-in");
    const withPolicy = visibleOrgSubGroups(entry!.subGroups!, {
      ...ctx,
      viewer: {
        ...viewer,
        permissions: [...(viewer.permissions ?? []), "mobile_device_policy.configure"],
      },
    });
    expect(withPolicy.map((g) => g.id)).toContain("mobile-sign-in");
  });
});
