import { describe, expect, it } from "vitest";
import { buildDesignerStructure, UNGROUPED_ID } from "./group-structure";
import type {
  CustomFieldDefinitionDto,
  FieldGroupDto,
} from "@/types/custom-fields";

function def(p: Partial<CustomFieldDefinitionDto>): CustomFieldDefinitionDto {
  return {
    id: 0,
    source: "custom",
    entity_type: "app_auth.User",
    field_key: "k",
    field_label: "L",
    field_type: "text",
    is_required: false,
    is_filterable: false,
    sort_order: 0,
    choices: null,
    validation_rules: null,
    description: "",
    is_active: true,
    required_at: "never",
    roles: [],
    filled_by: "both",
    group: null,
    show_on_create: false,
    show_on_edit: true,
    show_on_detail: true,
    form_input_mode: "editable",
    ...p,
  };
}

const groups: FieldGroupDto[] = [
  { id: 2, entity_type: "app_auth.User", name: "Address", sort_order: 1, is_active: true },
  { id: 1, entity_type: "app_auth.User", name: "Personal", sort_order: 0, is_active: true },
];

describe("buildDesignerStructure", () => {
  it("orders groups by sort_order then id, with ungrouped last", () => {
    const defs = [
      def({ id: 10, group: 2, sort_order: 0 }),
      def({ id: 11, group: 1, sort_order: 1 }),
      def({ id: 12, group: null, sort_order: 0 }),
    ];
    const s = buildDesignerStructure(defs, groups);
    expect(s.map((g) => g.id)).toEqual([1, 2, UNGROUPED_ID]);
    expect(s[2].name).toBe("General");
  });

  it("orders fields within a group by sort_order then id", () => {
    const defs = [
      def({ id: 20, group: 1, sort_order: 5 }),
      def({ id: 21, group: 1, sort_order: 1 }),
      def({ id: 22, group: 1, sort_order: 1 }),
    ];
    const s = buildDesignerStructure(defs, groups);
    const personal = s.find((g) => g.id === 1)!;
    expect(personal.fields.map((f) => f.id)).toEqual([21, 22, 20]);
  });

  it("includes empty groups so admins can drag into them", () => {
    const s = buildDesignerStructure([], groups);
    expect(s.find((g) => g.id === 1)?.fields).toEqual([]);
    // Ungrouped bucket only appears when it has fields
    expect(s.find((g) => g.id === UNGROUPED_ID)).toBeUndefined();
  });
});
