import { describe, expect, it } from "vitest";
import type { FormConfig, FormConfigField, FormConfigGroup } from "@/types/form-config";
import {
  applyFieldReorder,
  applyGroupReorder,
  reindexGroupFields,
  reindexGroups,
} from "./reorder-ops";
import { UNGROUPED_ID } from "./group-structure";

function field(id: number, sortOrder: number, groupId: number | null = 1): FormConfigField {
  return {
    id,
    source: "custom",
    fieldKey: `field_${id}`,
    fieldLabel: `Field ${id}`,
    fieldType: "text",
    choices: null,
    description: "",
    requiredAt: "never",
    filledBy: "both",
    isFilterable: false,
    sortOrder,
    validationRules: null,
    groupId,
  };
}

function group(
  id: number | null,
  sortOrder: number,
  fields: FormConfigField[] = [],
): FormConfigGroup {
  return { id, name: id == null ? "General" : `Group ${id}`, sortOrder, fields };
}

function config(groups: FormConfigGroup[]): FormConfig {
  return { entityType: "app_auth.User", surface: "edit", groups };
}

describe("reindexGroupFields", () => {
  it("maps the ungrouped sentinel to group_id null", () => {
    const out = reindexGroupFields(UNGROUPED_ID, [5]);
    expect(out[0].group_id).toBeNull();
  });
});

describe("reindexGroups", () => {
  it("assigns 0..n sort_order to ordered group ids, skipping the ungrouped sentinel", () => {
    const out = reindexGroups([3, UNGROUPED_ID, 1]);
    expect(out).toEqual([
      { id: 3, sort_order: 0 },
      { id: 1, sort_order: 1 },
    ]);
  });
});

describe("applyGroupReorder", () => {
  it("reorders groups by new sort_order and keeps the id:null bucket last", () => {
    const input = config([
      group(1, 0),
      group(2, 1),
      group(null, 2, [field(10, 0, null)]),
    ]);
    const out = applyGroupReorder(input, [
      { id: 2, sort_order: 0 },
      { id: 1, sort_order: 1 },
    ]);

    expect(out.groups.map((g) => g.id)).toEqual([2, 1, null]);
    expect(out.groups[0].sortOrder).toBe(0);
    expect(out.groups[1].sortOrder).toBe(1);
    expect(out.groups[2].sortOrder).toBe(2);
  });

  it("ignores group ids not present in the cached config", () => {
    const input = config([group(1, 0)]);
    const out = applyGroupReorder(input, [
      { id: 1, sort_order: 0 },
      { id: 99, sort_order: 1 },
    ]);

    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].id).toBe(1);
  });
});

describe("applyFieldReorder", () => {
  it("reorders fields within a group and leaves other groups untouched", () => {
    const input = config([
      group(1, 0, [field(1, 0), field(2, 1), field(3, 2)]),
      group(2, 1, [field(4, 0), field(5, 1)]),
    ]);
    const out = applyFieldReorder(input, [
      { id: 3, sort_order: 0 },
      { id: 1, sort_order: 1 },
      { id: 2, sort_order: 2 },
    ]);

    expect(out.groups[0].fields.map((f) => f.id)).toEqual([3, 1, 2]);
    expect(out.groups[1].fields.map((f) => f.id)).toEqual([4, 5]);
  });

  it("ignores field ids not present in the cached config", () => {
    const input = config([group(1, 0, [field(1, 0), field(2, 1)])]);
    const out = applyFieldReorder(input, [
      { id: 2, sort_order: 0 },
      { id: 99, sort_order: 1 },
    ]);

    expect(out.groups[0].fields.find((f) => f.id === 2)?.sortOrder).toBe(0);
    expect(out.groups[0].fields.map((f) => f.id)).toEqual([1, 2]);
  });
});
