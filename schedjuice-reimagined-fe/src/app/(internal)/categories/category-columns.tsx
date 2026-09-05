import { column, type Column } from "@/components/data-table";
import type { Category } from "@/sdk";

export function getCategoryColumns(isMsEnabled = true): Column<Category>[] {
  const cols: Column<Category>[] = [
    column.text<Category>({
      id: "name",
      header: "Name",
      accessor: (row) => row.name,
      sizing: { role: "person" },
    }),
  ];

  if (isMsEnabled) {
    cols.push(
      column.status<Category>({
        id: "is_payment_assignment_eligible",
        header: "Payment Assignment Eligible",
        accessor: (row) => (row.is_payment_assignment_eligible ? "Yes" : "No"),
      }),
    );
  }

  return cols;
}

export const categoryColumns = getCategoryColumns(true);
