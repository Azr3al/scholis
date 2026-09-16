import type { SheetAdapter } from "@/components/data-sheet/types";
import { canEditUser } from "@/helpers/authorization";
import type { FormConfigField } from "@/types/form-config";
import type { accountType } from "@/types/user";
import type { StudentDataSheetRow } from "@/types/data-sheets";

import { STUDENT_SHEET_READ_ONLY_FIELDS } from "./student-data-sheet-columns";
import {
  applyStudentFieldValue,
  studentFieldText,
} from "./student-data-sheet-field-utils";

type StudentDataSheetAdapterOpts = {
  rows: StudentDataSheetRow[];
  fieldByPath: Map<string, FormConfigField>;
  canEdit: boolean;
  viewer: accountType | null;
  onCellChange: (
    rowIndex: number,
    fieldId: string,
    value: string,
    previousRow: StudentDataSheetRow,
  ) => void;
};

export function makeStudentDataSheetAdapter(
  opts: StudentDataSheetAdapterOpts,
): SheetAdapter {
  const { rows, fieldByPath, canEdit, viewer, onCellChange } = opts;

  const isFieldEditable = (rowIndex: number, fieldId: string): boolean => {
    if (!canEdit || STUDENT_SHEET_READ_ONLY_FIELDS.has(fieldId)) return false;
    const row = rows[rowIndex];
    if (!row || !viewer) return false;
    return canEditUser(viewer, row.id);
  };

  return {
    rowCount: rows.length,
    getCellValue: (row, field) => {
      const r = rows[row];
      if (!r) return "";
      return studentFieldText(r, field, fieldByPath.get(field));
    },
    setCellValue: (row, field, value) => {
      if (!isFieldEditable(row, field)) return;
      const record = rows[row];
      if (!record) return;
      onCellChange(row, field, value, record);
    },
    isCellEditable: isFieldEditable,
    getNumericValue: (row, field) => {
      const f = fieldByPath.get(field);
      if (f?.fieldType !== "number") return null;
      const raw = rows[row];
      if (!raw) return null;
      const text = studentFieldText(raw, field, f);
      if (!text) return null;
      const n = Number(text.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    },
  };
}

export function updateStudentRowLocally(
  rows: StudentDataSheetRow[],
  rowIndex: number,
  fieldId: string,
  value: string,
  field?: FormConfigField,
): StudentDataSheetRow[] {
  const copy = [...rows];
  const current = copy[rowIndex];
  if (!current) return rows;
  copy[rowIndex] = applyStudentFieldValue(current, fieldId, value, field);
  return copy;
}
