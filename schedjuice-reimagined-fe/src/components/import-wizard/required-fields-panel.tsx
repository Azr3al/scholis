"use client";
import { Input, Select, inputClassName } from "@/components/primitives";

import { memo, useMemo } from "react";

import type { ImportFieldDef } from "@/app/client-api/imports";
import useImportStore from "@/store/import-store";
import {
  getUnmappedRequiredFields,
  importFieldLabel,
} from "@/lib/imports/wizard-logic";

type FieldDefaultInputProps = {
  fieldKey: string;
};

const FieldDefaultInput = memo(function FieldDefaultInput({
  fieldKey,
}: FieldDefaultInputProps) {
  const value = useImportStore((s) => s.fieldDefaults[fieldKey] ?? "");
  const setFieldDefault = useImportStore((s) => s.setFieldDefault);

  return (
    <Input
      className="h-8 max-w-xs"
      placeholder="Default value"
      value={value}
      onChange={(e) => setFieldDefault(fieldKey, e.target.value)}
    />
  );
});

type FieldColumnSelectProps = {
  fieldKey: string;
  headers: string[];
  fields: ImportFieldDef[];
};

const FieldColumnSelect = memo(function FieldColumnSelect({
  fieldKey,
  headers,
  fields,
}: FieldColumnSelectProps) {
  const mapping = useImportStore((s) => s.mapping);
  const setColumnMapping = useImportStore((s) => s.setColumnMapping);

  const options = useMemo(
    () =>
      headers.map((header, colIndex) => {
        const mappedField = mapping[colIndex];
        const headerLabel = header.trim() || "(blank)";
        const hint =
          mappedField && mappedField !== fieldKey
            ? ` (→ ${importFieldLabel(fields, mappedField)})`
            : "";
        return {
          colIndex,
          label: `${headerLabel}${hint}`,
        };
      }),
    [headers, mapping, fieldKey, fields],
  );

  return (
    <Select
      onValueChange={(colIndex) =>
        setColumnMapping(Number(colIndex), fieldKey)
      }
      className="h-8 w-full min-w-0 max-w-xs"
      placeholder="Select column"
      items={options.map(({ colIndex, label }) => ({
        value: String(colIndex),
        label,
      }))}
    />
  );
});

type RequiredFieldsPanelProps = {
  fields: ImportFieldDef[];
  headers: string[];
};

export const RequiredFieldsPanel = memo(function RequiredFieldsPanel({
  fields,
  headers,
}: RequiredFieldsPanelProps) {
  const mapping = useImportStore((s) => s.mapping);
  const fieldDefaults = useImportStore((s) => s.fieldDefaults);

  const requiredMissing = useMemo(
    () => getUnmappedRequiredFields(fields, mapping, fieldDefaults),
    [fields, mapping, fieldDefaults],
  );

  if (requiredMissing.length === 0) return null;

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
        Required fields not mapped — map a column or set a default:
      </p>
      <ul className="mt-2 space-y-2">
        {requiredMissing.map((f) => (
          <li
            key={f.field_key}
            className="flex min-w-0 flex-wrap items-center gap-2 text-sm"
          >
            <span
              className="min-w-0 max-w-[12rem] shrink-0 truncate"
              title={f.field_label}
            >
              {f.field_label}
            </span>
            <FieldColumnSelect
              fieldKey={f.field_key}
              headers={headers}
              fields={fields}
            />
            <span className="text-muted-foreground">or</span>
            <FieldDefaultInput fieldKey={f.field_key} />
          </li>
        ))}
      </ul>
    </div>
  );
});
