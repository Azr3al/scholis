import type { ImportFieldDef } from "@/app/client-api/imports";

export type CellEditorKind =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "choice"
  | "link-user"
  | "link-course";

export function editorKindForField(
  fieldKey: string,
  fieldByKey: ReadonlyMap<string, ImportFieldDef>,
): CellEditorKind {
  const def = fieldByKey.get(fieldKey);
  if (!def) return "text";

  if (def.special === "user" || fieldKey === "email") return "link-user";
  if (def.special === "course" || fieldKey === "courses") return "link-course";

  switch (def.field_type) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "date":
      return "date";
    case "choice":
      return "choice";
    default:
      return "text";
  }
}
