"use client";

import { useCallback, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";

import { useAutosaveForm } from "@/hooks/use-autosave-form";

import {
  getDefaultValues,
  getObjectFormSchema,
  withRequiredEmptyStringMessages,
} from "./schema-utils";
import type { FieldConfigItem, UseAutoFormOptions } from "./types";

function buildShouldAutosave(
  fieldConfig: Record<string, FieldConfigItem> | undefined,
  override?: (name: string) => boolean,
) {
  return (name: string) => {
    if (override && !override(name)) return false;
    if (fieldConfig?.[name]?.autosave === false) return false;
    return true;
  };
}

/**
 * RHF setup + edit-kit autosave when saveMode=edit.
 * Callers that already own a form instance pass `form`.
 */
export function useAutoForm(options: UseAutoFormOptions) {
  const {
    schema,
    saveMode,
    form: externalForm,
    defaultValues,
    values,
    units,
    shouldAutosaveField,
    onAutosave,
    autosaveQueryKey,
    fieldConfig,
  } = options;

  const resolvedSchema = useMemo(
    () => withRequiredEmptyStringMessages(schema),
    [schema],
  );
  const objectSchema = useMemo(
    () => getObjectFormSchema(resolvedSchema),
    [resolvedSchema],
  );
  const schemaDefaults = useMemo(
    () => getDefaultValues(objectSchema),
    [objectSchema],
  );

  const internalForm = useForm({
    resolver: zodResolver(resolvedSchema),
    defaultValues: { ...schemaDefaults, ...defaultValues },
    values,
  });

  const form: UseFormReturn<any> = externalForm ?? internalForm;

  const autosaveEnabled =
    saveMode === "edit" && typeof onAutosave === "function";

  const shouldAutosave = useMemo(
    () => buildShouldAutosave(fieldConfig, shouldAutosaveField),
    [fieldConfig, shouldAutosaveField],
  );

  const autosave = useAutosaveForm({
    form,
    enabled: autosaveEnabled,
    queryKey: autosaveQueryKey ?? ["auto-form-edit"],
    units,
    shouldAutosaveField: shouldAutosave,
    save: async (diff) => {
      if (!onAutosave) return;
      return onAutosave(diff);
    },
  });

  const bindFieldBlur = useCallback(
    (name: string) => {
      if (!autosaveEnabled) return;
      autosave.bindField(name).onBlur();
    },
    [autosave, autosaveEnabled],
  );

  return {
    form,
    FormProvider,
    autosave,
    autosaveEnabled,
    bindFieldBlur,
    objectSchema,
    resolvedSchema,
  };
}
