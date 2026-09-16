import type { ImportFieldDef } from "@/app/client-api/imports";
import type { FormConfigField } from "@/types/form-config";
import type { StudentDataSheetRow } from "@/types/data-sheets";

export function formFieldToImportDef(field: FormConfigField): ImportFieldDef {
  return {
    field_key: field.fieldKey,
    field_label: field.fieldLabel,
    field_type: field.fieldType,
    choices: field.choices,
    validation_rules: field.validationRules,
    source: field.source === "builtin" ? "builtin" : "custom",
    special: null,
    required_for_role: false,
  };
}

function fieldValueAtRow(
  row: StudentDataSheetRow,
  fieldId: string,
): unknown {
  if (fieldId === "courses") {
    return row.courses;
  }
  if (fieldId === "id_photo") {
    return row.has_id_photo;
  }
  if (fieldId.startsWith("custom_data.")) {
    const key = fieldId.slice("custom_data.".length);
    return row.custom_data?.[key];
  }
  return (row as Record<string, unknown>)[fieldId];
}

function formatStudentFieldDisplay(
  raw: unknown,
  field?: FormConfigField,
): string {
  if (raw == null || raw === "") return "";

  if (field?.fieldType === "boolean") {
    if (raw === true || raw === "true") return "true";
    if (raw === false || raw === "false") return "false";
  }

  if (field?.fieldType === "multichoice" && Array.isArray(raw)) {
    return raw.map(String).join(", ");
  }

  if (field?.fieldType === "choice" && field.choices?.length) {
    const str = String(raw);
    const hit = field.choices.find(
      (c) => c.value === str || c.label === str,
    );
    return hit?.label ?? str;
  }

  return String(raw);
}

export function studentFieldText(
  row: StudentDataSheetRow,
  fieldId: string,
  field?: FormConfigField,
): string {
  if (fieldId === "courses") {
    return row.courses.map((c) => c.title).join(", ");
  }
  if (fieldId === "id_photo") {
    return "";
  }
  return formatStudentFieldDisplay(fieldValueAtRow(row, fieldId), field);
}

export function applyStudentFieldValue(
  row: StudentDataSheetRow,
  fieldId: string,
  value: string,
  field?: FormConfigField,
): StudentDataSheetRow {
  const next = value.trim();
  const stored = coerceStoredValue(next, field);

  if (fieldId.startsWith("custom_data.")) {
    const key = fieldId.slice("custom_data.".length);
    return {
      ...row,
      custom_data: {
        ...row.custom_data,
        [key]: stored,
      },
    };
  }

  return {
    ...row,
    [fieldId]: stored,
  } as StudentDataSheetRow;
}

function coerceStoredValue(
  value: string,
  field?: FormConfigField,
): string | boolean | string[] | null {
  if (value === "") return null;

  if (field?.fieldType === "boolean") {
    return value === "true";
  }

  if (field?.fieldType === "multichoice") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (field?.fieldType === "number") {
    return value;
  }

  return value;
}
