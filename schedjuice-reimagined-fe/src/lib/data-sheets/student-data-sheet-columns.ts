import { fieldFormPath } from "@/lib/custom-fields/field-policy";
import type { FormConfig, FormConfigField } from "@/types/form-config";
import type { GridColumn } from "@glideapps/glide-data-grid";

export const STUDENT_SHEET_READ_ONLY_FIELDS = new Set(["id_photo", "courses"]);

/** Always shown even when absent from tenant form config (like id_photo). */
const ALWAYS_INCLUDE_IDENTITY_FIELDS = [
  { fieldId: "gender", title: "Gender", width: 100 },
  { fieldId: "date_of_birth", title: "DOB", width: 120 },
] as const;

/** Legacy static columns when form-config has not loaded or has no fields. */
const FALLBACK_DATA_COLUMNS: { fieldId: string; title: string; width: number }[] =
  [
    { fieldId: "alternative_name", title: "Alternative name", width: 160 },
    { fieldId: "phone_number", title: "Phone", width: 140 },
    { fieldId: "communication_email", title: "Email", width: 240 },
    { fieldId: "gender", title: "Gender", width: 100 },
    { fieldId: "date_of_birth", title: "DOB", width: 120 },
    { fieldId: "nrc_passport", title: "NRC/Passport", width: 180 },
    { fieldId: "city", title: "City", width: 140 },
    { fieldId: "township", title: "Township", width: 140 },
    { fieldId: "region", title: "Region", width: 140 },
    { fieldId: "facebook_account_link", title: "Facebook", width: 220 },
  ];

type StudentSheetColumn = {
  fieldId: string;
  title: string;
  width: number;
  field?: FormConfigField;
};

function defaultWidth(field?: FormConfigField): number {
  if (!field) {
    return 140;
  }
  switch (field.fieldType) {
    case "textarea":
      return 240;
    case "url":
    case "email":
      return 220;
    default:
      return 140;
  }
}

export function flattenFormConfigFields(
  config: FormConfig | undefined,
): FormConfigField[] {
  if (!config) return [];
  return config.groups.flatMap((g) => g.fields);
}

export function formConfigFieldByPath(
  fields: FormConfigField[],
): Map<string, FormConfigField> {
  const map = new Map<string, FormConfigField>();
  for (const f of fields) {
    map.set(fieldFormPath(f), f);
  }
  return map;
}

export function buildStudentDataSheetColumns(
  config: FormConfig | undefined,
): StudentSheetColumn[] {
  const configFields = flattenFormConfigFields(config);
  const seen = new Set<string>();
  const cols: StudentSheetColumn[] = [];

  const add = (
    fieldId: string,
    title: string,
    field?: FormConfigField,
    widthOverride?: number,
  ) => {
    if (seen.has(fieldId)) return;
    seen.add(fieldId);
    cols.push({
      fieldId,
      title,
      width:
        widthOverride ??
        (fieldId === "name" ? 200 : defaultWidth(field)),
      field,
    });
  };

  add("name", "Name", configFields.find((f) => f.fieldKey === "name"));
  add(
    "code",
    "Student code",
    configFields.find((f) => f.fieldKey === "code"),
  );
  add("id_card_class_name", "ID card class");
  add("courses", "Courses", undefined, 220);
  add("id_photo", "ID photo");

  for (const identity of ALWAYS_INCLUDE_IDENTITY_FIELDS) {
    add(
      identity.fieldId,
      identity.title,
      configFields.find((f) => f.fieldKey === identity.fieldId),
      identity.width,
    );
  }

  for (const f of configFields) {
    const path = fieldFormPath(f);
    if (path === "name" || path === "code") continue;
    add(path, f.fieldLabel, f);
  }

  if (configFields.length === 0) {
    for (const f of FALLBACK_DATA_COLUMNS) {
      add(f.fieldId, f.title, undefined, f.width);
    }
  }

  return cols;
}

export function toGridColumns(sheetColumns: StudentSheetColumn[]): GridColumn[] {
  return sheetColumns.map((c) => ({
    id: c.fieldId,
    title: c.title,
    width: c.width,
  }));
}

export function toFieldByColumn(
  sheetColumns: StudentSheetColumn[],
): string[] {
  return sheetColumns.map((c) => c.fieldId);
}
