import type {
  CustomFieldDefinitionDto,
  FieldGroupDto,
} from "@/types/custom-fields";

/** Sentinel id for the synthetic "General" bucket of ungrouped fields. */
export const UNGROUPED_ID = -1;
const UNGROUPED_NAME = "General";

export type DesignerGroup = {
  id: number; // real group id or UNGROUPED_ID
  name: string;
  sort_order: number;
  isUngrouped: boolean;
  fields: CustomFieldDefinitionDto[];
};

function byOrderThenId<T extends { sort_order: number; id: number }>(a: T, b: T) {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.id - b.id;
}

/**
 * Build the ordered designer structure. All active groups are included (even
 * empty ones, so admins can drop fields into them). Ungrouped fields collect
 * into a synthetic "General" bucket appended last, only when non-empty.
 */
export function buildDesignerStructure(
  definitions: CustomFieldDefinitionDto[],
  groups: FieldGroupDto[]
): DesignerGroup[] {
  const realGroups: DesignerGroup[] = [...groups]
    .sort(byOrderThenId)
    .map((g) => ({
      id: g.id,
      name: g.name,
      sort_order: g.sort_order,
      isUngrouped: false,
      fields: [],
    }));
  const byId = new Map(realGroups.map((g) => [g.id, g]));

  const ungrouped: DesignerGroup = {
    id: UNGROUPED_ID,
    name: UNGROUPED_NAME,
    sort_order: Number.MAX_SAFE_INTEGER,
    isUngrouped: true,
    fields: [],
  };

  for (const def of definitions) {
    const bucket = def.group != null ? byId.get(def.group) : undefined;
    (bucket ?? ungrouped).fields.push(def);
  }

  for (const g of realGroups) g.fields.sort(byOrderThenId);
  ungrouped.fields.sort(byOrderThenId);

  return ungrouped.fields.length > 0 ? [...realGroups, ungrouped] : realGroups;
}
