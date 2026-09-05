"use client";
import { useToast } from "@/components/primitives";

import type { FieldMeasure } from "@/lib/ui/field-measure";
import * as z from "zod";
import AutoForm, {
  defaultDetailsGroup,
  getObjectFormSchema,
  resolveAutoFormSchema,
  type AutoFormGroup,
  type FieldConfigItem,
  type ZodObjectOrWrapped,
} from "@/components/auto-form";
import { Button } from "@/components/primitives";
import { useForm, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { useMutation, useQuery } from "@tanstack/react-query";

import { setFormErrrors, scheduleScrollToFirstFormError } from "@/helpers/form";
import { queryClient } from "@/lib/query";
import { useMemo, useCallback, useEffect, type ReactNode } from "react";
import { makePostRequest, updateEntity } from "@/app/client-api/utils";
import { fetchEntity } from "@/app/client-api/utils";

interface GenericFormProps {
  isEdit?: boolean;
  entityId?: string | number;
  schema: ZodObjectOrWrapped;
  entityName: string;
  apiUrl: string;
  redirectUrl?: string;
  onSubmit?: (data: any, submit: () => void) => any;
  onSuccess?: (created?: any) => void;
  onCancel?: () => void;
  fieldConfig?: Record<string, FieldConfigItem>;
  measure?: FieldMeasure;
  isLoading?: boolean;
  /** Skeleton inputs while async schema or field metadata loads (e.g. custom fields). */
  fieldsLoading?: boolean;
  formInstance?: UseFormReturn<any>;
  watchValues?: string[];
  /** Edit-mode only: map to saveMode="edit" + optimistic autosave-on-blur. */
  autosave?: boolean;
  /**
   * Logical field groups. When omitted, a temporary single "Details" group is
   * used — F1/F2 pages must supply real groups soon.
   * TODO(F1/F2): require explicit groups; remove defaultDetailsGroup fallback.
   */
  groups?: AutoFormGroup[];
  /** Atomic autosave units (edit mode). */
  units?: string[][];
  shouldAutosaveField?: (name: string) => boolean;
  /**
   * Edit autosave: fields that require an explicit Save button (money, roles).
   * Renders a type="button" control that PATCHes only these keys.
   */
  explicitSaveFields?: string[];
  explicitSaveLabel?: string;
  /** Sticky footer submit label when not using edit autosave. */
  submitLabel?: string;
  /** Slot for high-risk explicit Save controls under edit autosave. */
  children?: ReactNode;
}

const GenericForm: React.FC<GenericFormProps> = ({
  isEdit = false,
  entityId,
  schema,
  entityName,
  apiUrl,
  redirectUrl,
  onSuccess: onSucess,
  onCancel,
  onSubmit,
  fieldConfig,
  measure,
  isLoading: isLoadingProp,
  fieldsLoading,
  formInstance: externalFormInstance,
  watchValues,
  autosave = false,
  groups: groupsProp,
  units,
  shouldAutosaveField,
  explicitSaveFields,
  explicitSaveLabel = "Save changes",
  submitLabel,
  children,
}) => {
  const resolvedSchema = useMemo(
    () => resolveAutoFormSchema(schema),
    [schema],
  );
  const objectFormSchema = getObjectFormSchema(resolvedSchema);
  const router = useRouter();
  const toast = useToast();
  const { data, isSuccess, isLoading } = useQuery({
    queryKey: [`get${entityName}`, entityId, isEdit],
    queryFn: () => fetchEntity(apiUrl, entityId!),
    enabled: isEdit,
  });
  const entityData = isEdit && isSuccess ? data?.data?.data : undefined;
  const internalForm = useForm<z.infer<typeof objectFormSchema>>({
    resolver: zodResolver(resolvedSchema),
    values: entityData,
  });
  const form: UseFormReturn<any> = externalFormInstance ?? internalForm;

  useEffect(() => {
    if (isEdit && externalFormInstance && entityData) {
      externalFormInstance.reset(entityData);
    }
  }, [isEdit, externalFormInstance, entityData]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && externalFormInstance) {
      console.warn(
        "GenericForm: external formInstance should use zodResolverForAutoForm(schema) " +
          "so validation matches AutoForm. See @/components/auto-form.",
      );
    }
  }, [externalFormInstance]);

  // Scoped watch only — never form.watch() without names (auto-form perf contract).
  if (watchValues?.length) {
    form.watch(watchValues as never);
  }

  // isEdit + autosave → edit saveMode; otherwise create-style explicit Submit.
  const effectiveSaveMode =
    autosave && isEdit ? ("edit" as const) : ("create" as const);

  const groups = useMemo(
    () => groupsProp ?? defaultDetailsGroup(schema),
    [groupsProp, schema],
  );

  const createMutation = useMutation({
    mutationKey: [`create${entityName}`],
    mutationFn: (data: any) => makePostRequest(apiUrl, data),
    onError: (e) => {
      const applied = setFormErrrors(e, form);
      if (applied) scheduleScrollToFirstFormError(form);
      if (!applied) {
        toast.add({
          type: "error",
          description: `Failed to create ${entityName}`,
        });
      }
    },
    onSuccess: (res) => {
      toast.add({
        description: `${entityName} created successfully`,
      });
      queryClient.invalidateQueries({
        queryKey: [`getAll${entityName}`],
      });
      if (onSucess) {
        onSucess(res);
      } else {
        router.push(redirectUrl || `/${apiUrl}`);
      }
    },
  });

  const updateMutation = useMutation({
    mutationKey: [`update${entityName}`],
    mutationFn: (data: any) => updateEntity(apiUrl, entityId!, data),
    onError: (e) => {
      const applied = setFormErrrors(e, form);
      if (applied) scheduleScrollToFirstFormError(form);
      if (!applied) {
        toast.add({
          type: "error",
          description: `Failed to update ${entityName}`,
        });
      }
    },
    onSuccess: () => {
      toast.add({
        description: `${entityName} updated successfully`,
      });
      queryClient.invalidateQueries({
        queryKey: [`get${entityName}`, entityId, `getAll${entityName}`],
      });
      if (onSucess) {
        onSucess();
      }
    },
  });

  const isAutosave = autosave && isEdit;
  const autosaveQueryKey = [`get${entityName}`, entityId, true] as const;

  const createEnhancedFieldType = useCallback(
    (originalFieldType: Function) => {
      return (props: any) => {
        const enhancedProps = {
          ...props,
          form,
        };
        return originalFieldType(enhancedProps);
      };
    },
    [form],
  );

  const enhancedFieldConfig = useMemo(() => {
    if (!fieldConfig) return fieldConfig;

    return Object.keys(fieldConfig).reduce(
      (acc, key) => {
        const fieldConfigItem = fieldConfig[key];
        if (
          fieldConfigItem.fieldType &&
          typeof fieldConfigItem.fieldType === "function"
        ) {
          acc[key] = {
            ...fieldConfigItem,
            fieldType: createEnhancedFieldType(
              fieldConfigItem.fieldType as Function,
            ),
          };
        } else {
          acc[key] = fieldConfigItem;
        }
        return acc;
      },
      {} as Record<string, FieldConfigItem>,
    );
  }, [fieldConfig, createEnhancedFieldType]);

  const handleAutosave = useCallback(
    async (diff: Record<string, unknown>) => {
      try {
        return await updateEntity(apiUrl, entityId!, diff);
      } catch (e) {
        const applied = setFormErrrors(e, form);
        if (applied) scheduleScrollToFirstFormError(form);
        throw e;
      }
    },
    [apiUrl, entityId, form],
  );

  const handleExplicitSave = useCallback(() => {
    if (!explicitSaveFields?.length) return;
    const values = form.getValues() as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const key of explicitSaveFields) {
      payload[key] = values[key];
    }
    updateMutation.mutate(payload);
  }, [explicitSaveFields, form, updateMutation]);

  return (
    <AutoForm
      schema={schema}
      saveMode={effectiveSaveMode}
      groups={groups}
      measure={measure}
      isLoading={
        Boolean(fieldsLoading) ||
        (isEdit ? isLoading || Boolean(isLoadingProp) : Boolean(isLoadingProp))
      }
      form={form}
      fieldConfig={enhancedFieldConfig}
      units={units}
      shouldAutosaveField={shouldAutosaveField}
      onAutosave={isAutosave ? handleAutosave : undefined}
      autosaveQueryKey={isAutosave ? [...autosaveQueryKey] : undefined}
      onCancel={onCancel}
      isSubmitting={
        createMutation.isLoading ||
        updateMutation.isLoading ||
        Boolean(isLoadingProp)
      }
      stickyFooter={!isAutosave}
      submitLabel={submitLabel}
      onSubmit={(data) => {
        if (onSubmit) {
          if (isEdit) {
            onSubmit(data, () => {
              updateMutation.mutate(data);
            });
          } else {
            onSubmit(data, () => {
              createMutation.mutate(data);
            });
          }
          return;
        }

        if (isEdit) {
          updateMutation.mutate(data);
        } else {
          createMutation.mutate(data);
        }
      }}
    >
      {isAutosave && explicitSaveFields?.length ? (
        <div className="mt-6 flex min-h-10 items-center gap-3">
          <Button
            type="button"
            onClick={handleExplicitSave}
            isLoading={updateMutation.isLoading}
          >
            {explicitSaveLabel}
          </Button>
        </div>
      ) : null}
      {children}
    </AutoForm>
  );
};

export default GenericForm;
