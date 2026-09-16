import { column, type Column } from "@/components/data-table";
import type { Discount } from "@/sdk";
import { formatDiscountScope } from "@/types/finance";

export function getDiscountColumns(
  eligibilityEnabled = true,
): Column<Discount>[] {
  const cols: Column<Discount>[] = [
    column.text<Discount>({
      id: "name",
      header: "Name",
      accessor: (row) => row.name,
      sizing: { role: "person" },
    }),
    column.status<Discount>({
      id: "discount_type",
      header: "Type",
      accessor: (row) => row.discount_type,
    }),
    column.numeric<Discount>({
      id: "percent_value",
      header: "Percent",
      accessor: (row) =>
        row.discount_type === "percent" && row.percent_value != null
          ? row.percent_value
          : null,
    }),
    column.numeric<Discount>({
      id: "fixed_amount",
      header: "Fixed amount",
      accessor: (row) => row.fixed_amount,
    }),
    column.text<Discount>({
      id: "scope",
      header: "Scope",
      accessor: (row) => formatDiscountScope(row.scope),
      sizing: { role: "prose" },
    }),
  ];

  if (eligibilityEnabled) {
    cols.push(
      column.text<Discount>({
        id: "eligibility_type",
        header: "Eligibility",
        accessor: (row) => row.eligibility_type ?? "none",
        sizing: { role: "prose" },
      }),
    );
  }

  cols.push(
    column.status<Discount>({
      id: "is_active",
      header: "Active",
      accessor: (row) => (row.is_active ? "Yes" : "No"),
    }),
  );

  return cols;
}

export const discountColumns = getDiscountColumns(true);
