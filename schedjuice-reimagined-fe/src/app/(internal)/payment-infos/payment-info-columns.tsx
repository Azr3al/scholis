import { column, type Column } from "@/components/data-table";
import type { PaymentInfo } from "@/sdk";

export const paymentInfoColumns: Column<PaymentInfo>[] = [
  column.text<PaymentInfo>({
    id: "user",
    header: "Staff member",
    accessor: (row) => row.user?.name,
    sizing: { role: "person" },
  }),
  column.text<PaymentInfo>({
    id: "account_name",
    header: "Account name",
    accessor: (row) => row.account_name,
    sizing: { role: "person" },
  }),
  column.text<PaymentInfo>({
    id: "bank_type",
    header: "Bank type",
    accessor: (row) => row.bank_type,
    sizing: { role: "prose" },
  }),
  column.text<PaymentInfo>({
    id: "description",
    header: "Account/wallet number",
    accessor: (row) => row.description,
    sizing: { role: "prose", wrap: "truncate" },
  }),
  column.status<PaymentInfo>({
    id: "is_default",
    header: "Default",
    accessor: (row) => (row.is_default ? "Default" : null),
  }),
  column.date<PaymentInfo>({
    id: "updated_at",
    header: "Updated",
    accessor: (row) => row.updated_at,
  }),
];
