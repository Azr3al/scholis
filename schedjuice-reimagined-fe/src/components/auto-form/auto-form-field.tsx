"use client";

import { memo } from "react";
import {
  Controller,
  useFormContext,
  useFormState,
  type Control,
} from "react-hook-form";
import type { z } from "zod";

import { renderMappedFieldControl } from "./field-map";
import type { FieldConfigItem } from "./types";
import type { FieldMeasure } from "@/lib/ui/field-measure";

export type AutoFormFieldProps = {
  name: string;
  zodItem: z.ZodTypeAny;
  fieldConfigItem?: FieldConfigItem;
  formMeasure?: FieldMeasure;
  groupMeasure?: FieldMeasure;
  control?: Control<any>;
  isLoading?: boolean;
  onFieldBlur?: (name: string) => void;
};

/**
 * Single-field boundary. Subscribes via Controller for `name` only —
 * never watches the whole form. Memoized so sibling fields do not re-render
 * when an unrelated field updates (Profiler acceptance for F0).
 */
function AutoFormFieldInner({
  name,
  zodItem,
  fieldConfigItem = {},
  formMeasure,
  groupMeasure,
  control: controlProp,
  isLoading,
  onFieldBlur,
}: AutoFormFieldProps) {
  const form = useFormContext();
  const control = controlProp ?? form.control;
  const { errors } = useFormState({ control, name });
  const errorMessage = (errors as Record<string, { message?: string } | undefined>)[
    name
  ]?.message;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <>
          {renderMappedFieldControl({
            name,
            zodItem,
            fieldConfigItem,
            formMeasure,
            groupMeasure,
            field: {
              ...field,
              onBlur: () => {
                field.onBlur();
                onFieldBlur?.(name);
              },
            },
            error:
              typeof errorMessage === "string" ? errorMessage : undefined,
            isLoading,
          })}
        </>
      )}
    />
  );
}

export const AutoFormField = memo(AutoFormFieldInner);
AutoFormField.displayName = "AutoFormField";
