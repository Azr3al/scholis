import type { SheetAdapter } from "@/components/data-sheet/types";

export function makeReadOnlyAdapter(opts: {
  rowCount: number;
  getCellValue: (row: number, field: string) => string;
  getNumericValue?: (row: number, field: string) => number | null;
}): SheetAdapter {
  return {
    rowCount: opts.rowCount,
    getCellValue: opts.getCellValue,
    setCellValue: () => {},
    isCellEditable: () => false,
    getNumericValue: opts.getNumericValue,
  };
}
