import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteEntity,
  makePostRequest,
  updateEntity,
} from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import {
  applyFieldReorder,
  applyGroupReorder,
  type GroupReorderItem,
  type ReorderItem,
} from "@/lib/custom-fields/reorder-ops";
import type { FormConfig } from "@/types/form-config";

type FormConfigSnapshot = [readonly unknown[], FormConfig | undefined][];

/**
 * All write operations for the Form Designer. Each mutation invalidates the
 * designer queries AND the form-config query so the preview pane re-fetches
 * (preview === production). Reorder mutations also patch the form-config cache
 * optimistically so the preview updates instantly.
 */
export function useFieldPolicyMutations(entityType: string) {
  const qc = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["fieldDefinitions", entityType] }),
      qc.invalidateQueries({ queryKey: ["fieldGroups", entityType] }),
      qc.invalidateQueries({ queryKey: ["formConfig"] }),
    ]);
  };

  const snapshotFormConfigs = (): FormConfigSnapshot =>
    qc.getQueriesData<FormConfig>({ queryKey: ["formConfig", entityType] });

  const restoreFormConfigs = (previous: FormConfigSnapshot | undefined) => {
    if (!previous) return;
    for (const [key, data] of previous) {
      qc.setQueryData(key, data);
    }
  };

  const patchFormConfigs = (
    patch: (config: FormConfig) => FormConfig,
    previous: FormConfigSnapshot,
  ) => {
    for (const [key, data] of previous) {
      if (data) qc.setQueryData(key, patch(data));
    }
  };

  const createDefinition = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      makePostRequest("custom-field-definitions", body),
    onSuccess: () => {
      void invalidate();
    },
  });

  const updateDefinition = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      updateEntity("custom-field-definitions", id, body),
    onSuccess: invalidate,
  });

  const deleteDefinition = useMutation({
    mutationFn: (id: number) => deleteEntity("custom-field-definitions", id),
    onSuccess: invalidate,
  });

  const createGroup = useMutation({
    mutationFn: (body: {
      entity_type: string;
      name: string;
      sort_order?: number;
    }) => makePostRequest("field-groups", body),
    onSuccess: invalidate,
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      updateEntity("field-groups", id, body),
    onSuccess: invalidate,
  });

  const deleteGroup = useMutation({
    mutationFn: (id: number) => deleteEntity("field-groups", id),
    onSuccess: invalidate,
  });

  const reorderDefinitions = useMutation({
    mutationFn: (items: ReorderItem[]) =>
      axiosClient.post("custom-field-definitions/reorder", {
        entity_type: entityType,
        items,
      }),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ["formConfig", entityType] });
      const previous = snapshotFormConfigs();
      patchFormConfigs((config) => applyFieldReorder(config, items), previous);
      return { previous };
    },
    onError: (_error, _items, context) => {
      restoreFormConfigs(context?.previous);
    },
    onSettled: () => {
      void invalidate();
    },
  });

  const reorderGroups = useMutation({
    mutationFn: (items: GroupReorderItem[]) =>
      axiosClient.post("field-groups/reorder", {
        entity_type: entityType,
        items,
      }),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ["formConfig", entityType] });
      const previous = snapshotFormConfigs();
      patchFormConfigs((config) => applyGroupReorder(config, items), previous);
      return { previous };
    },
    onError: (_error, _items, context) => {
      restoreFormConfigs(context?.previous);
    },
    onSettled: () => {
      void invalidate();
    },
  });

  return {
    createDefinition,
    updateDefinition,
    deleteDefinition,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderDefinitions,
    reorderGroups,
  };
}
