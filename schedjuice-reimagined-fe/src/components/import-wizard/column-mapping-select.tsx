"use client";
import { Select } from "@/components/primitives";

import { memo } from "react";

import type { ImportFieldDef } from "@/app/client-api/imports";

export type GroupedFields = {
  special: ImportFieldDef[];
  builtin: ImportFieldDef[];
  custom: ImportFieldDef[];
};

const byFieldLabel = (a: ImportFieldDef, b: ImportFieldDef) =>
  a.field_label.localeCompare(b.field_label, undefined, {
    sensitivity: "base",
  });

export function groupFields(fields: ImportFieldDef[]): GroupedFields {
  const special: ImportFieldDef[] = [];
  const builtin: ImportFieldDef[] = [];
  const custom: ImportFieldDef[] = [];
  for (const f of fields) {
    if (f.special) special.push(f);
    else if (f.source === "custom") custom.push(f);
    else builtin.push(f);
  }
  special.sort(byFieldLabel);
  builtin.sort(byFieldLabel);
  custom.sort(byFieldLabel);
  return { special, builtin, custom };
}

type ColumnMappingSelectProps = {
  colIndex: number;
  header: string;
  value: string;
  grouped: GroupedFields;
  onMap: (colIndex: number, value: string) => void;
};

export const ColumnMappingSelect = memo(function ColumnMappingSelect({
  colIndex,
  header,
  value,
  grouped,
  onMap,
}: ColumnMappingSelectProps) {
  return (
    <th className="max-w-[12rem]">
      <div className="min-w-0 space-y-2">
        <div className="truncate text-xs font-medium" title={header || "(blank)"}>
          {header || "(blank)"}
        </div>
        <Select
          value={value ?? undefined}
          onValueChange={(v) => onMap(colIndex, String(v ?? ""))}
          className="h-8 w-full min-w-0 max-w-[12rem]"
          placeholder="Map field"
          items={[
            { value: "__ignore__", label: "Ignore" },
            { value: "__create__", label: "Create custom field…" },
            ...grouped.special.map((field) => ({
              value: field.field_key,
              label: `${field.field_label}${field.special ? " (auto-links)" : ""}${field.required_for_role ? " *" : ""}`,
            })),
            ...grouped.builtin.map((field) => ({
              value: field.field_key,
              label: `${field.field_label}${field.required_for_role ? " *" : ""}`,
            })),
            ...grouped.custom.map((field) => ({
              value: field.field_key,
              label: field.field_label,
            })),
          ]}
        />
      </div>
    </th>
  );
});

type ColumnMappingTableProps = {
  headers: string[];
  rows: (string | number | null)[][];
  mapping: Record<number, string | null>;
  grouped: GroupedFields;
  onMap: (colIndex: number, value: string) => void;
};

export const ColumnMappingTable = memo(function ColumnMappingTable({
  headers,
  rows,
  mapping,
  grouped,
  onMap,
}: ColumnMappingTableProps) {
  const previewRows = rows.slice(0, 5);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table>
        <thead>
          <tr>
            {headers.map((header, colIndex) => (
              <ColumnMappingSelect
                key={`${header}-${colIndex}`}
                colIndex={colIndex}
                header={header}
                value={mapping[colIndex] ?? "__ignore__"}
                grouped={grouped}
                onMap={onMap}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, rowIndex) => (
            <tr key={`preview-${rowIndex}`}>
              {headers.map((_, colIndex) => (
                <td
                  key={`${rowIndex}-${colIndex}`}
                  className="max-w-[12rem] truncate"
                  title={
                    row[colIndex] === null || row[colIndex] === undefined
                      ? undefined
                      : String(row[colIndex])
                  }
                >
                  {row[colIndex] === null || row[colIndex] === undefined
                    ? ""
                    : String(row[colIndex])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
