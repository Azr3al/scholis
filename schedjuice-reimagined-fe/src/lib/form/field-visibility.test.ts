import { describe, expect, it } from "vitest";
import { role, type accountType } from "@/types/user";
import {
  activeStatusGroup,
  appendActiveStatusGroup,
  canManageActiveStatus,
  highRiskFieldsWithActive,
  omitFormFields,
} from "./field-visibility";

const adminUser = { roles: [role.admin] } as accountType;
const teacherUser = { roles: [role.teacher] } as accountType;

describe("field-visibility", () => {
  it("canManageActiveStatus allows admin roles only", () => {
    expect(canManageActiveStatus(adminUser)).toBe(true);
    expect(canManageActiveStatus(teacherUser)).toBe(false);
    expect(canManageActiveStatus(undefined)).toBe(false);
  });

  it("omitFormFields removes active and sort order when requested", () => {
    expect(
      omitFormFields(["name", "is_active", "sort_order"], {
        active: true,
        sortOrder: true,
      }),
    ).toEqual(["name"]);
  });

  it("activeStatusGroup returns status group only when allowed", () => {
    expect(activeStatusGroup(true)).toEqual({
      id: "status",
      title: "Status",
      fields: ["is_active"],
    });
    expect(activeStatusGroup(false)).toBeNull();
  });

  it("appendActiveStatusGroup appends status group when allowed", () => {
    const base = [{ id: "identity", title: "Identity", fields: ["name"] }];
    expect(appendActiveStatusGroup(base, false)).toEqual(base);
    expect(appendActiveStatusGroup(base, true)).toHaveLength(2);
  });

  it("highRiskFieldsWithActive includes is_active only for admins", () => {
    expect(highRiskFieldsWithActive(["scope"], true)).toEqual([
      "scope",
      "is_active",
    ]);
    expect(highRiskFieldsWithActive(["scope"], false)).toEqual(["scope"]);
  });
});
