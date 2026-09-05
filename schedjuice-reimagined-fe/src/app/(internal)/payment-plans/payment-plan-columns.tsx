import { column, type Column } from "@/components/data-table";
import { updateEntity } from "@/app/client-api/utils";
import { formatMoney } from "@/helpers/money";
import type { PaymentPlan } from "@/sdk";

type CreatePaymentPlanColumnsOptions = {
  showLegacyDiscountFields?: boolean;
  currencySymbol: string;
};

export function createPaymentPlanColumns(
  options: CreatePaymentPlanColumnsOptions,
): Column<PaymentPlan>[] {
  const { showLegacyDiscountFields = false, currencySymbol } = options;

  const columns: Column<PaymentPlan>[] = [
    column.text<PaymentPlan>({
      id: "name",
      header: "Name",
      accessor: (row) => row.name,
      sizing: { role: "person" },
    }),
    column.editableText<PaymentPlan>({
      id: "price",
      header: "Price",
      accessor: (row) =>
        row.price != null ? String(row.price) : "",
      sizing: { role: "control", tabular: true },
      formatDisplay: (v) => formatMoney(v, currencySymbol),
      onSave: async (row, value) => {
        await updateEntity("payment-plans", row.id, { price: value });
      },
    }),
  ];

  if (showLegacyDiscountFields) {
    columns.push(
      column.editableText<PaymentPlan>({
        id: "per_hour_price",
        header: "Per Hour Price",
        accessor: (row) =>
          row.per_hour_price != null ? String(row.per_hour_price) : "",
        sizing: { role: "control", tabular: true },
        formatDisplay: (v) => formatMoney(v, currencySymbol),
        onSave: async (row, value) => {
          await updateEntity("payment-plans", row.id, {
            per_hour_price: value,
          });
        },
      }),
    );
  }

  columns.push(
    column.date<PaymentPlan>({
      id: "created_at",
      header: "Created Date",
      accessor: (row) => row.created_at,
    }),
    column.date<PaymentPlan>({
      id: "updated_at",
      header: "Last Updated",
      accessor: (row) => row.updated_at,
    }),
  );

  return columns;
}
