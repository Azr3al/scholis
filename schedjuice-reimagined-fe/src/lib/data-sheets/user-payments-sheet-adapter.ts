import type { SheetAdapter } from "@/components/data-sheet/types";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import {
  isPaymentFieldEditable,
  paymentFieldDisplayValue,
  type PaymentEditableField,
} from "@/lib/data-sheets/payment-row-utils";

const EDITABLE_FIELDS = new Set<string>([
  "transaction_id",
  "description",
  "remarks",
  "parsed_amount",
  "date_on_screenshot",
]);

type UserPaymentsSheetAdapterOpts = {
  rows: StudentPaymentAdminReportRow[];
  /** Optimistic local update before API confirms. */
  onLocalUpdate: (
    rowIndex: number,
    field: string,
    value: string,
  ) => void;
  /** Persist a cell edit (regular row or synthetic create). */
  onPersistCell: (
    row: StudentPaymentAdminReportRow,
    field: PaymentEditableField,
    value: string,
  ) => void;
};

export function makeUserPaymentsSheetAdapter(
  opts: UserPaymentsSheetAdapterOpts,
): SheetAdapter {
  const { rows, onLocalUpdate, onPersistCell } = opts;

  return {
    rowCount: rows.length,
    getCellValue: (row, field) => {
      const r = rows[row];
      return r ? paymentFieldDisplayValue(r, field) : "";
    },
    setCellValue: (row, field, value) => {
      if (!EDITABLE_FIELDS.has(field)) return;
      const r = rows[row];
      if (!r || !isPaymentFieldEditable(r, field)) return;
      onLocalUpdate(row, field, value);
      onPersistCell(r, field as PaymentEditableField, value);
    },
    isCellEditable: (row, field) => {
      const r = rows[row];
      if (!r) return false;
      return isPaymentFieldEditable(r, field);
    },
    getNumericValue: (row, field) => {
      if (field !== "parsed_amount") return null;
      const r = rows[row];
      if (!r?.parsed_amount) return null;
      const n = Number(r.parsed_amount);
      return Number.isFinite(n) ? n : null;
    },
  };
}
