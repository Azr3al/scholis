import { useQuery } from "@tanstack/react-query";

import { fetchEntities } from "@/app/client-api/utils";
import { queryParamDefault } from "@/config/defaults";
import {
  extractCustomFieldDefinitionRows,
  normalizeCustomFieldDefinitionRow,
} from "@/lib/custom-fields/parse-definition-list-response";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";
import { CUSTOM_FIELD_ENTITY_USER } from "@/types/custom-fields";

type Options = { enabled?: boolean };

/**
 * Admin source-of-truth list: ALL active definitions (both custom and builtin)
 * for an entity type, ordered by (sort_order, id). Powers the designer left pane.
 *
 * The list endpoint returns every active row regardless of entity type and the
 * shared query params do not support server-side filtering, so we filter by
 * entity_type client-side (row counts are tiny and capped per tenant).
 */
export function useFieldDefinitions(
  entityType: string = CUSTOM_FIELD_ENTITY_USER,
  options?: Options
) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: ["fieldDefinitions", entityType],
    enabled,
    queryFn: async (): Promise<CustomFieldDefinitionDto[]> => {
      const res = await fetchEntities("custom-field-definitions", {
        ...queryParamDefault,
        page: 1,
        size: 500,
        sorts: ["sort_order", "id"],
      });
      const rows: CustomFieldDefinitionDto[] = [];
      for (const raw of extractCustomFieldDefinitionRows(res)) {
        const n = normalizeCustomFieldDefinitionRow(raw);
        if (n && n.is_active && n.entity_type === entityType) rows.push(n);
      }
      return rows;
    },
    staleTime: 30_000,
  });
}
