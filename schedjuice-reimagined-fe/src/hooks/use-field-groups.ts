import { useQuery } from "@tanstack/react-query";

import { fetchEntities } from "@/app/client-api/utils";
import { queryParamDefault } from "@/config/defaults";
import { extractCustomFieldDefinitionRows } from "@/lib/custom-fields/parse-definition-list-response";
import type { FieldGroupDto } from "@/types/custom-fields";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";

type Options = { enabled?: boolean };

function normalizeGroupRow(raw: unknown): FieldGroupDto | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "number") return null;
  if (typeof r.entity_type !== "string" || typeof r.name !== "string") {
    return null;
  }
  const so = r.sort_order;
  const sort_order =
    typeof so === "number" && Number.isFinite(so) ? so : Number(so ?? 0) || 0;
  return {
    id: r.id,
    entity_type: r.entity_type,
    name: r.name,
    sort_order,
    is_active: r.is_active !== false,
  };
}

/** Admin list of active field groups for an entity type, ordered by sort_order. */
export function useFieldGroups(
  entityType: string = CUSTOM_FIELD_ENTITY_USER,
  options?: Options
) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: ["fieldGroups", entityType],
    enabled,
    queryFn: async (): Promise<FieldGroupDto[]> => {
      const res = await fetchEntities("field-groups", {
        ...queryParamDefault,
        page: 1,
        size: 500,
        sorts: ["sort_order", "id"],
      });
      const rows: FieldGroupDto[] = [];
      for (const raw of extractCustomFieldDefinitionRows(res)) {
        const g = normalizeGroupRow(raw);
        if (g && g.is_active && g.entity_type === entityType) rows.push(g);
      }
      return rows;
    },
    staleTime: 30_000,
  });
}
