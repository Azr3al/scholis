"use client";

import { AttachmentFieldInput } from "@/components/custom-fields/attachment-field-input";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/primitives";
import { DatePicker } from "@/components/date/date-picker";
import { DateTimePicker } from "@/components/date/date-time-picker";

import { FieldLabelSuffix } from "@/components/form/required-mark";
import { getDateISOString } from "@/helpers/date";
import { fieldFormPath } from "@/lib/custom-fields/field-policy";
import type { FormConfigField } from "@/types/form-config";
import { Controller, type UseFormReturn } from "react-hook-form";

type ControlField = {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  name: string;
};

export interface FieldRendererProps {
  form: UseFormReturn<any>;
  field: FormConfigField;
  required: boolean;
  readOnly: boolean;
  commitField?: (name: string) => void;
  entityType?: string;
}

export function FieldRenderer({
  form,
  field,
  required,
  readOnly,
  commitField,
  entityType = "app_auth.User",
}: FieldRendererProps) {
  const path = fieldFormPath(field);
  return (
    <Controller
      control={form.control}
      name={path}
      render={({ field: rhf, fieldState }) => (
        <Field.Root
          name={path}
          data-field-name={path}
          className={
            field.fieldType === "textarea" || field.fieldType === "attachment"
              ? "md:col-span-2"
              : undefined
          }
          invalid={Boolean(fieldState.error)}
        >
          <Field.Label>
            {field.fieldLabel}
            <FieldLabelSuffix required={required} />
          </Field.Label>
          {renderControl(field, rhf, readOnly, commitField, entityType)}
          {field.description ? (
            <Field.Description>{field.description}</Field.Description>
          ) : null}
          {fieldState.error?.message ? (
            <Field.Error>{fieldState.error.message}</Field.Error>
          ) : null}
        </Field.Root>
      )}
    />
  );
}

function renderControl(
  def: FormConfigField,
  field: ControlField,
  readOnly: boolean,
  commitField?: (name: string) => void,
  entityType?: string,
) {
  const commit = () => commitField?.(field.name);

  switch (def.fieldType) {
    case "textarea":
      return (
        <Textarea
          name={field.name}
          value={(field.value as string) ?? ""}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          name={field.name}
          value={field.value == null ? "" : String(field.value)}
          onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
          onBlur={field.onBlur}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
    case "date":
      return (
        <DatePicker
          name={field.name}
          onBlur={field.onBlur}
          date={field.value ? new Date(field.value as string | Date) : undefined}
          setDate={(date) => {
            field.onChange(date ? getDateISOString(date) : undefined);
            commit();
          }}
          disabled={readOnly}
        />
      );
    case "datetime":
      return (
        <DateTimePicker
          name={field.name}
          onBlur={field.onBlur}
          date={field.value ? new Date(field.value as string) : undefined}
          setDate={(date) => {
            field.onChange(date ? date.toISOString() : undefined);
            commit();
          }}
          disabled={readOnly}
        />
      );
    case "boolean":
      return (
        <Switch
          checked={Boolean(field.value)}
          onCheckedChange={(checked) => {
            field.onChange(checked);
            commit();
          }}
          disabled={readOnly}
        />
      );
    case "choice": {
      const choices = def.choices ?? [];
      return (
        <Select
          value={(field.value as string) ?? ""}
          onValueChange={(value) => {
            field.onChange(value);
            commit();
          }}
          disabled={readOnly}
          name={field.name}
          placeholder="Select an option"
          items={choices.map((c) => ({ value: c.value, label: c.label }))}
        />
      );
    }
    case "multichoice": {
      const choices = def.choices ?? [];
      const selected = Array.isArray(field.value) ? (field.value as string[]) : [];
      return (
        <div className="space-y-2">
          {choices.map((c) => {
            const checked = selected.includes(c.value);
            return (
              <div key={c.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${def.fieldKey}-${c.value}`}
                  checked={checked}
                  disabled={readOnly}
                  onCheckedChange={(isChecked) => {
                    field.onChange(
                      isChecked
                        ? [...selected, c.value]
                        : selected.filter((v) => v !== c.value),
                    );
                    commit();
                  }}
                />
                <label htmlFor={`${def.fieldKey}-${c.value}`}>{c.label}</label>
              </div>
            );
          })}
        </div>
      );
    }
    case "email":
      return (
        <Input
          type="email"
          name={field.name}
          value={(field.value as string) ?? ""}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
    case "url":
      return (
        <Input
          type="url"
          name={field.name}
          value={(field.value as string) ?? ""}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
    case "attachment":
      return (
        <AttachmentFieldInput
          field={def}
          entityType={entityType ?? "app_auth.User"}
          value={field.value}
          onChange={(next) => {
            field.onChange(next);
            commit();
          }}
          readOnly={readOnly}
        />
      );
    default:
      return (
        <Input
          name={field.name}
          value={(field.value as string) ?? ""}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          readOnly={readOnly}
          disabled={readOnly}
        />
      );
  }
}
