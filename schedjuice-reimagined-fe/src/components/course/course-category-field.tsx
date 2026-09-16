"use client";

import type { ReactNode } from "react";

import EntityCombobox from "@/components/form/entity-combobox";
import { RequiredMark } from "@/components/form/required-mark";
import { Field } from "@/components/primitives";
import { categoryCreateConfig } from "@/helpers/category-create-config";
import { cn } from "@/lib/utils";
import { queryParamOptions } from "@/types/api";

const CATEGORY_COMBO_QUERY_PARAMS: queryParamOptions = {
  fields: ["id", "name"],
  sorts: ["name"],
};

export function CourseCategoryField({
  value,
  onChange,
  label = "Category",
  isRequired = false,
  formDescription,
  error,
  placeholder = "Select category",
  queryParams = CATEGORY_COMBO_QUERY_PARAMS,
  hideLabel = false,
  allowDeselect = true,
}: {
  value: number | null | undefined;
  onChange: (categoryId: number | null) => void;
  label?: string;
  isRequired?: boolean;
  formDescription?: ReactNode;
  error?: string;
  placeholder?: string;
  queryParams?: queryParamOptions;
  hideLabel?: boolean;
  allowDeselect?: boolean;
}) {
  return (
    <Field.Root className="space-y-2" invalid={Boolean(error)}>
      {!hideLabel ? (
        <Field.Label className={cn(error && "text-destructive")}>
          {label}
          {isRequired ? <RequiredMark /> : null}
        </Field.Label>
      ) : null}
      <EntityCombobox
        entity="categories"
        queryParams={queryParams}
        displayFunction={(e) => e.name}
        value={String(value ?? "")}
        onChange={(v) => onChange(v ? parseInt(v, 10) : null)}
        label={hideLabel ? label : ""}
        hideLabel={hideLabel}
        onCreateNew={categoryCreateConfig}
        comboboxPlaceholder={placeholder}
        allowDeselect={allowDeselect}
        containerClassName={hideLabel ? undefined : "[&>div>p]:hidden"}
      />
      {formDescription ? (
        <Field.Description>{formDescription}</Field.Description>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : null}
    </Field.Root>
  );
}
