import { describe, it, expect } from "vitest";
import {
  buildDraftMatrix,
  getChangedRoles,
  groupCatalogByDomain,
  toggleRoleCode,
} from "../matrix-grid-utils";
import type { RbacCatalogEntry, RbacRole } from "@/api/rbac";

const catalog: RbacCatalogEntry[] = [
  {
    code: "course.view",
    label: "View courses",
    sentence: "view courses",
    data_class: "Academic",
    tier: "tenant",
    sensitive: false,
  },
  {
    code: "course.update",
    label: "Edit courses",
    sentence: "edit courses",
    data_class: "Academic",
    tier: "tenant",
    sensitive: false,
  },
  {
    code: "payment.view",
    label: "View payments",
    sentence: "view payments",
    data_class: "Financial",
    tier: "tenant",
    sensitive: false,
  },
];

const roles: RbacRole[] = [
  {
    id: 1,
    slug: "teacher",
    display_name: "Teacher",
    is_system: true,
    is_assignable: true,
    codes: ["course.view"],
  },
  {
    id: 2,
    slug: "manager",
    display_name: "Manager",
    is_system: true,
    is_assignable: true,
    codes: ["course.view", "course.update"],
  },
];

describe("matrix grid helpers", () => {
  it("groups catalog rows by domain prefix", () => {
    const grouped = groupCatalogByDomain(catalog);
    expect(grouped.map((group) => group.domain)).toEqual(["course", "payment"]);
    expect(grouped[0]?.entries.map((entry) => entry.code)).toEqual([
      "course.update",
      "course.view",
    ]);
  });

  it("toggles a permission code on and off", () => {
    expect(toggleRoleCode(["course.view"], "course.update", true)).toEqual([
      "course.update",
      "course.view",
    ]);
    expect(toggleRoleCode(["course.view", "course.update"], "course.view", false)).toEqual([
      "course.update",
    ]);
  });

  it("detects changed roles for save", () => {
    const drafts = buildDraftMatrix(roles);
    drafts[2] = toggleRoleCode(drafts[2]!, "payment.view", true);

    expect(getChangedRoles(roles, drafts)).toEqual([
      { roleId: 2, codes: ["course.update", "course.view", "payment.view"] },
    ]);
  });
});
