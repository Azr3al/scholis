import type { GridColumn } from "@glideapps/glide-data-grid";

import { formatPlainAmount } from "@/helpers/money";

export type ExcellentChoiceReportRow = {
  date: string;
  voucher_no: number | string;
  sub: string;
  series: string;
  name: string;
  discount_type: string;
  cash_received: string;
  bank_ac: string;
  transaction_id: string;
  authorized_person: string;
  student_user_id?: number | null;
  student_email?: string | null;
  authorized_by_user_id?: number | null;
  authorized_by_name?: string | null;
  authorized_by_email?: string | null;
};

export type ExcellentChoiceSummaryRow = {
  date: "SUM";
  voucher_no: string;
  sub: string;
  series: string;
  name: string;
  discount_type: string;
  cash_received: string;
  bank_ac: string;
  transaction_id: string;
  authorized_person: string;
  _is_summary: true;
};

export type ExcellentChoiceDisplayRow =
  | ExcellentChoiceReportRow
  | ExcellentChoiceSummaryRow;

export function isExcellentChoiceSummaryRow(
  row: ExcellentChoiceDisplayRow,
): row is ExcellentChoiceSummaryRow {
  return "_is_summary" in row && row._is_summary === true;
}

export type ExcellentChoiceColumnDef = {
  id: keyof ExcellentChoiceReportRow;
  title: string;
  width: number;
  multiline?: boolean;
};

export type ExcellentChoiceColumnMeta = {
  key: keyof ExcellentChoiceReportRow;
  title: string;
  width: number;
};

export const EXCELLENT_CHOICE_MULTILINE_FIELDS = new Set<
  keyof ExcellentChoiceReportRow
>(["sub", "series", "discount_type", "bank_ac", "transaction_id"]);

const DEFAULT_COLUMNS: ExcellentChoiceColumnDef[] = [
  { id: "date", title: "Date", width: 110 },
  { id: "voucher_no", title: "Voucher No", width: 110 },
  { id: "sub", title: "Sub", width: 220, multiline: true },
  { id: "series", title: "Series", width: 160, multiline: true },
  { id: "name", title: "Name", width: 180 },
  { id: "discount_type", title: "Discount Type", width: 200, multiline: true },
  { id: "cash_received", title: "Cash Received", width: 130 },
  { id: "bank_ac", title: "Bank /AC", width: 160, multiline: true },
  { id: "transaction_id", title: "Transaction ID", width: 200, multiline: true },
  { id: "authorized_person", title: "Authorized Person", width: 220 },
];

const DEFAULT_WIDTH_BY_KEY = Object.fromEntries(
  DEFAULT_COLUMNS.map((column) => [column.id, column.width]),
) as Record<keyof ExcellentChoiceReportRow, number>;

export function buildExcellentChoiceColumns(
  meta?: ExcellentChoiceColumnMeta[],
): ExcellentChoiceColumnDef[] {
  if (!meta?.length) {
    return DEFAULT_COLUMNS;
  }
  return meta.map((column) => ({
    id: column.key,
    title: column.title,
    width: DEFAULT_WIDTH_BY_KEY[column.key] ?? 160,
    multiline: EXCELLENT_CHOICE_MULTILINE_FIELDS.has(column.key),
  }));
}

export function toExcellentChoiceGridColumns(
  columns: ExcellentChoiceColumnDef[],
): GridColumn[] {
  return columns.map((column) => ({
    id: column.id,
    title: column.title,
    width: column.width,
  }));
}

export function toExcellentChoiceFieldByColumn(
  columns: ExcellentChoiceColumnDef[],
): string[] {
  return columns.map((column) => column.id);
}

export function countLines(value: string | null | undefined): number {
  if (!value) {
    return 1;
  }
  return value.split("\n").length;
}

export function rowLineCount(row: ExcellentChoiceDisplayRow): number {
  if (isExcellentChoiceSummaryRow(row)) {
    return 1;
  }
  let maxLines = 1;
  for (const field of Array.from(EXCELLENT_CHOICE_MULTILINE_FIELDS)) {
    maxLines = Math.max(maxLines, countLines(String(row[field] ?? "")));
  }
  return maxLines;
}

export function rowHeightForLineCount(
  lineCount: number,
  baseRowHeight: number,
): number {
  const lines = Math.max(1, lineCount);
  return Math.max(baseRowHeight, baseRowHeight + (lines - 1) * 18);
}

export function precomputeExcellentChoiceRowHeights(
  rows: ExcellentChoiceDisplayRow[],
  baseRowHeight: number,
): number[] {
  return rows.map((row) =>
    rowHeightForLineCount(rowLineCount(row), baseRowHeight),
  );
}

export const EXCELLENT_CHOICE_GRID_ROW_THRESHOLD = 300;

export function sumCashReceived(rows: ExcellentChoiceReportRow[]): number {
  return rows.reduce((total, row) => {
    const parsed = parseFloat(String(row.cash_received ?? ""));
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

export function buildExcellentChoiceSummaryRow(
  rows: ExcellentChoiceReportRow[],
  apiSummary?: Pick<ExcellentChoiceSummaryRow, "date" | "voucher_no"> | null,
): ExcellentChoiceSummaryRow {
  const voucherNo =
    apiSummary?.voucher_no ?? formatPlainAmount(sumCashReceived(rows));
  return {
    date: "SUM",
    voucher_no: voucherNo,
    sub: "",
    series: "",
    name: "",
    discount_type: "",
    cash_received: "",
    bank_ac: "",
    transaction_id: "",
    authorized_person: "",
    _is_summary: true,
  };
}
