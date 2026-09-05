import type { ImportFieldDef } from "@/app/client-api/imports";
import { editorKindForField } from "@/components/import-grid/cell-editors/editor-kind";
import type { FormConfigField } from "@/types/form-config";
import type { StudentDataSheetRow } from "@/types/data-sheets";
import {
  GridCellKind,
  type GridCell,
  type Item,
} from "@glideapps/glide-data-grid";

import { normalizeCell } from "@/lib/imports/normalize-cell";

import { STUDENT_SHEET_READ_ONLY_FIELDS } from "./student-data-sheet-columns";
import {
  formFieldToImportDef,
  studentFieldText,
} from "./student-data-sheet-field-utils";
import {
  initialsFromName,
} from "@/components/data-sheet/cells/id-photo-cell";

type StudentCellContext = {
  rows: StudentDataSheetRow[];
  fieldByColumn: string[];
  fieldByPath: Map<string, FormConfigField>;
  canEdit: boolean;
  errorCells?: Set<string>;
  getIdPhotoUrl?: (userId: number) => string | null | undefined;
};

function cellErrorKey(rowIndex: number, fieldId: string): string {
  return `${rowIndex}:${fieldId}`;
}

export function getStudentDataSheetCellContent(
  [col, row]: Item,
  ctx: StudentCellContext,
): GridCell {
  const r = ctx.rows[row];
  const fieldId = ctx.fieldByColumn[col];
  if (!r || !fieldId) {
    return readonlyTextCell("");
  }

  const field = ctx.fieldByPath.get(fieldId);
  const hasError = ctx.errorCells?.has(cellErrorKey(row, fieldId)) ?? false;
  const themeOverride = hasError
    ? { bgCell: "#fff1f2", textDark: "#991b1b" }
    : undefined;

  if (fieldId === "courses") {
    return {
      kind: GridCellKind.Custom,
      allowOverlay: false,
      readonly: true,
      copyData: r.courses.map((c) => c.title).join(", "),
      data: { kind: "course-chips-cell", courses: r.courses },
      themeOverride,
    };
  }

  if (fieldId === "id_photo") {
    return {
      kind: GridCellKind.Custom,
      allowOverlay: false,
      readonly: true,
      copyData: "",
      data: {
        kind: "id-photo-cell",
        userId: r.id,
        url: r.has_id_photo ? (ctx.getIdPhotoUrl?.(r.id) ?? null) : null,
        initials: initialsFromName(r.name),
      },
      themeOverride,
    };
  }

  const value = studentFieldText(r, fieldId, field);
  const editable =
    ctx.canEdit && !STUDENT_SHEET_READ_ONLY_FIELDS.has(fieldId);

  if (!field) {
    return {
      kind: GridCellKind.Text,
      data: value,
      displayData: value,
      allowOverlay: editable,
      readonly: !editable,
      themeOverride,
    };
  }

  const importDef = formFieldToImportDef(field);
  const lookupKey = fieldId.startsWith("custom_data.")
    ? fieldId.slice("custom_data.".length)
    : fieldId;
  const editorKind = editorKindForField(
    lookupKey,
    buildFieldMap(lookupKey, importDef),
  );

  if (editorKind === "boolean") {
    const boolVal = value === "true";
    return {
      kind: GridCellKind.Boolean,
      data: boolVal,
      allowOverlay: false,
      readonly: !editable,
      themeOverride,
    };
  }

  if (editorKind === "number") {
    const parsed = Number(value.replace(/,/g, ""));
    return {
      kind: GridCellKind.Number,
      data: Number.isNaN(parsed) ? undefined : parsed,
      displayData: value,
      readonly: !editable,
      allowOverlay: editable,
      contentAlign: "right",
      themeOverride,
    };
  }

  const norm = normalizeCell(value, importDef);

  if (editorKind === "date" || editorKind === "choice") {
    return {
      kind: GridCellKind.Text,
      data: value,
      displayData: norm.value,
      allowOverlay: false,
      readonly: !editable,
      themeOverride,
    };
  }

  return {
    kind: GridCellKind.Text,
    data: value,
    displayData: norm.value,
    allowOverlay: editable,
    readonly: !editable,
    themeOverride,
  };
}

function readonlyTextCell(value: string): GridCell {
  return {
    kind: GridCellKind.Text,
    data: value,
    displayData: value,
    allowOverlay: false,
    readonly: true,
  };
}

function buildFieldMap(
  fieldKey: string,
  def: ImportFieldDef,
): ReadonlyMap<string, ImportFieldDef> {
  return new Map([[fieldKey, def]]);
}

export { cellErrorKey };
