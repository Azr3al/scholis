"use client";

import { Button, Checkbox, Field, Skeleton } from "@/components/primitives";
import {
  clearFieldKeys,
  DVR_BUILTIN_FIELD_NAMES,
  selectAllFieldKeys,
  type DvrFieldConfig,
} from "@/helpers/dvr";
import { cn } from "@/lib/utils";
import type { CustomFieldDefinitionDto } from "@/types/custom-fields";
import type { Dispatch, SetStateAction } from "react";

function DvrFieldRow({
  fieldKey,
  label,
  selectedFields,
  setSelectedFields,
}: {
  fieldKey: string;
  label: string;
  selectedFields: DvrFieldConfig[];
  setSelectedFields: Dispatch<SetStateAction<DvrFieldConfig[]>>;
}) {
  const current = selectedFields.find((f) => f.name === fieldKey);
  const included = Boolean(current);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Field.Root className="flex flex-row items-center gap-2">
        <Checkbox
          id={fieldKey}
          checked={included}
          onCheckedChange={(checked) => {
            setSelectedFields((prev) => {
              if (checked) {
                if (prev.some((f) => f.name === fieldKey)) return prev;
                return [...prev, { name: fieldKey, required: false }];
              }
              return prev.filter((f) => f.name !== fieldKey);
            });
          }}
        />
        <Field.Label htmlFor={fieldKey} className="capitalize">
          {label}
        </Field.Label>
      </Field.Root>
      <Field.Root className="flex flex-row items-center gap-2">
        <Checkbox
          id={`${fieldKey}-required`}
          checked={Boolean(current?.required)}
          disabled={!included}
          onCheckedChange={(checked) => {
            setSelectedFields((prev) =>
              prev.map((f) =>
                f.name === fieldKey
                  ? { ...f, required: Boolean(checked) }
                  : f,
              ),
            );
          }}
        />
        <Field.Label
          htmlFor={`${fieldKey}-required`}
          className="text-sm text-text-muted"
        >
          Required
        </Field.Label>
      </Field.Root>
    </div>
  );
}

function SectionBulkActions({
  labelPrefix,
  onSelectAll,
  onClearAll,
}: {
  labelPrefix: string;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs"
        aria-label={`${labelPrefix} select all`}
        onClick={onSelectAll}
      >
        Select all
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs"
        aria-label={`${labelPrefix} clear all`}
        onClick={onClearAll}
      >
        Clear all
      </Button>
    </div>
  );
}

export type DvrFieldCatalogProps = {
  selectedFields: DvrFieldConfig[];
  setSelectedFields: Dispatch<SetStateAction<DvrFieldConfig[]>>;
  customDefs: CustomFieldDefinitionDto[];
  defsLoading: boolean;
  defsError: boolean;
  className?: string;
};

export function DvrFieldCatalog({
  selectedFields,
  setSelectedFields,
  customDefs,
  defsLoading,
  defsError,
  className,
}: DvrFieldCatalogProps) {
  const customKeys = customDefs.map((d) => d.field_key);
  const showCustomBulk =
    !defsLoading && !defsError && customDefs.length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <Field.Root className="w-full" name="fields">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Field.Label>
            Fields <span className="text-destructive text-sm">*</span>
          </Field.Label>
          <SectionBulkActions
            labelPrefix="Fields"
            onSelectAll={() =>
              setSelectedFields((prev) =>
                selectAllFieldKeys(prev, DVR_BUILTIN_FIELD_NAMES),
              )
            }
            onClearAll={() =>
              setSelectedFields((prev) =>
                clearFieldKeys(prev, DVR_BUILTIN_FIELD_NAMES),
              )
            }
          />
        </div>
        {DVR_BUILTIN_FIELD_NAMES.map((field) => (
          <DvrFieldRow
            key={field}
            fieldKey={field}
            label={field.replaceAll("_", " ")}
            selectedFields={selectedFields}
            setSelectedFields={setSelectedFields}
          />
        ))}
        <div className="mt-4 w-full space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-text-secondary">
              Custom fields
            </p>
            {showCustomBulk ? (
              <SectionBulkActions
                labelPrefix="Custom fields"
                onSelectAll={() =>
                  setSelectedFields((prev) =>
                    selectAllFieldKeys(prev, customKeys),
                  )
                }
                onClearAll={() =>
                  setSelectedFields((prev) => clearFieldKeys(prev, customKeys))
                }
              />
            ) : null}
          </div>
          {defsLoading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-6 w-56" />
            </div>
          ) : null}
          {defsError ? (
            <p className="text-sm text-danger">Could not load custom fields.</p>
          ) : null}
          {!defsLoading && !defsError
            ? customDefs.map((def) => (
                <DvrFieldRow
                  key={def.field_key}
                  fieldKey={def.field_key}
                  label={def.field_label || def.field_key}
                  selectedFields={selectedFields}
                  setSelectedFields={setSelectedFields}
                />
              ))
            : null}
          {!defsLoading && !defsError && customDefs.length === 0 ? (
            <p className="text-sm text-text-muted">No custom fields defined.</p>
          ) : null}
        </div>
      </Field.Root>
    </div>
  );
}
