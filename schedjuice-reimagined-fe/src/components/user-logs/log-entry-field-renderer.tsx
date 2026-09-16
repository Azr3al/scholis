"use client";
import { Checkbox, Input, Select, Switch, Textarea } from "@/components/primitives";

import { DatePicker } from "@/components/users/date-picker";
import { DateTimePicker } from "@/components/users/date-time-picker";
import { getDateISOString } from "@/helpers/date";
import type { ReportTypeField } from "@/types/user-log";
import { CoursePicker, StaffUserPicker } from "./fk-field-pickers";

export function LogEntryFieldRenderer({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: ReportTypeField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="grid gap-4">
      {sorted.map((f) => {
        const v = values[f.field_key];
        return (
          <div key={f.field_key} className="space-y-1.5">
            <label>
              {f.field_label}
              {f.is_required ? (
                <span className="text-destructive"> *</span>
              ) : null}
            </label>
            {renderControl(f, v, (val) => onChange(f.field_key, val), disabled)}
          </div>
        );
      })}
    </div>
  );
}

function renderControl(
  f: ReportTypeField,
  value: unknown,
  set: (v: unknown) => void,
  disabled?: boolean,
) {
  switch (f.field_type) {
    case "staff_user_fk":
      return (
        <StaffUserPicker
          value={(value as number) ?? null}
          onChange={set}
          disabled={disabled}
        />
      );
    case "course_fk":
      return (
        <CoursePicker
          value={(value as number) ?? null}
          onChange={set}
          disabled={disabled}
        />
      );
    case "textarea":
      return (
        <Textarea
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value == null ? "" : String(value)}
          onChange={(e) =>
            set(e.target.value === "" ? undefined : e.target.value)
          }
          disabled={disabled}
        />
      );
    case "date":
      return (
        <DatePicker
          date={value ? new Date(value as string) : undefined}
          setDate={(d) => set(d ? getDateISOString(d) : undefined)}
          disabled={disabled}
        />
      );
    case "datetime":
      return (
        <DateTimePicker
          date={value ? new Date(value as string) : undefined}
          setDate={(d) => set(d ? d.toISOString() : undefined)}
          disabled={disabled}
        />
      );
    case "boolean":
      return (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={set}
          disabled={disabled}
        />
      );
    case "choice":
      return (
        <Select
          value={(value as string) ?? ""}
          onValueChange={set}
          disabled={disabled}
          items={(f.choices ?? []).map((c) => ({
            value: c.value,
            label: c.label,
          }))}
          placeholder="Select an option"
        />
      );
    case "multichoice": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          {(f.choices ?? []).map((c) => {
            const checked = selected.includes(c.value);
            return (
              <div key={c.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${f.field_key}-${c.value}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(isChecked) =>
                    set(
                      isChecked
                        ? [...selected, c.value]
                        : selected.filter((v) => v !== c.value),
                    )
                  }
                />
                <label htmlFor={`${f.field_key}-${c.value}`}>{c.label}</label>
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
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
        />
      );
    case "url":
      return (
        <Input
          type="url"
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
        />
      );
    default:
      return (
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
        />
      );
  }
}
