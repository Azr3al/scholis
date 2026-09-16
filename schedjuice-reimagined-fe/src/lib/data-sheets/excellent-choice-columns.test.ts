import { describe, expect, it } from "vitest";

import {
  buildExcellentChoiceColumns,
  buildExcellentChoiceSummaryRow,
  countLines,
  EXCELLENT_CHOICE_GRID_ROW_THRESHOLD,
  precomputeExcellentChoiceRowHeights,
  rowHeightForLineCount,
  rowLineCount,
  sumCashReceived,
  type ExcellentChoiceColumnMeta,
  type ExcellentChoiceReportRow,
} from "./excellent-choice-columns";

const sampleRow = (): ExcellentChoiceReportRow => ({
  date: "2026-07-01",
  voucher_no: 12,
  sub: "Math\nPhysics",
  series: "Jan 2026",
  name: "Aye Aye",
  discount_type: "",
  cash_received: "300",
  bank_ac: "KPay",
  transaction_id: "TX-1",
  authorized_person: "Staff (staff@example.com)",
});

describe("excellent-choice-columns", () => {
  it("counts wrapped lines for multiline fields", () => {
    const row: ExcellentChoiceReportRow = {
      date: "2026-07-01",
      voucher_no: 12,
      sub: "Math\nPhysics\nChemistry",
      series: "Jan 2026",
      name: "Aye Aye",
      discount_type: "",
      cash_received: "300",
      bank_ac: "KPay",
      transaction_id: "TX-1",
      authorized_person: "Staff (staff@example.com)",
    };

    expect(rowLineCount(row)).toBe(3);
    expect(countLines("")).toBe(1);
    expect(countLines("a\nb\nc")).toBe(3);
  });

  it("uses at least one line when multiline columns are empty", () => {
    const row: ExcellentChoiceReportRow = {
      date: "2026-07-01",
      voucher_no: 12,
      sub: "",
      series: "",
      name: "Aye Aye",
      discount_type: "",
      cash_received: "300",
      bank_ac: "",
      transaction_id: "",
      authorized_person: "",
    };

    expect(rowLineCount(row)).toBe(1);
  });

  it("scales row height from line count", () => {
    expect(rowHeightForLineCount(1, 36)).toBe(36);
    expect(rowHeightForLineCount(3, 36)).toBe(72);
  });

  it("precomputes row heights for every row", () => {
    const rows = [sampleRow(), sampleRow()];
    expect(precomputeExcellentChoiceRowHeights(rows, 36)).toEqual([54, 54]);
  });

  it("precomputes 500 row heights within a reasonable budget", () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({
      ...sampleRow(),
      voucher_no: index + 1,
    }));
    const started = performance.now();
    const heights = precomputeExcellentChoiceRowHeights(rows, 36);
    expect(heights).toHaveLength(500);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("uses a grid threshold above typical inline preview sizes", () => {
    expect(EXCELLENT_CHOICE_GRID_ROW_THRESHOLD).toBe(300);
  });

  it("maps API excel character widths to grid pixel defaults", () => {
    const columns = buildExcellentChoiceColumns([
      { key: "date", title: "Date", width: 12 },
    ]);
    expect(columns).toEqual([
      {
        id: "date",
        title: "Date",
        width: 110,
        multiline: false,
      },
    ]);
  });

  it("maps all known API columns to pixel defaults", () => {
    const apiMeta: ExcellentChoiceColumnMeta[] = [
      { key: "date", title: "Date", width: 12 },
      { key: "voucher_no", title: "Voucher No", width: 12 },
      { key: "sub", title: "Sub", width: 30 },
      { key: "series", title: "Series", width: 20 },
      { key: "name", title: "Name", width: 25 },
      { key: "discount_type", title: "Discount Type", width: 25 },
      { key: "cash_received", title: "Cash Received", width: 15 },
      { key: "bank_ac", title: "Bank /AC", width: 20 },
      { key: "transaction_id", title: "Transaction ID", width: 25 },
      { key: "authorized_person", title: "Authorized Person", width: 30 },
    ];
    const columns = buildExcellentChoiceColumns(apiMeta);
    expect(columns.map((column) => column.width)).toEqual([
      110, 110, 220, 160, 180, 200, 130, 160, 200, 220,
    ]);
  });

  it("falls back to 160px for unknown column keys", () => {
    const columns = buildExcellentChoiceColumns([
      { key: "unknown_field" as keyof ExcellentChoiceReportRow, title: "Extra", width: 12 },
    ]);
    expect(columns[0]?.width).toBe(160);
  });

  it("builds a summary row with comma-formatted total", () => {
    const rows = [
      { ...sampleRow(), cash_received: "100" },
      { ...sampleRow(), cash_received: "200" },
    ];
    expect(sumCashReceived(rows)).toBe(300);
    expect(buildExcellentChoiceSummaryRow(rows)).toMatchObject({
      date: "SUM",
      voucher_no: "300",
      _is_summary: true,
    });
  });
});
