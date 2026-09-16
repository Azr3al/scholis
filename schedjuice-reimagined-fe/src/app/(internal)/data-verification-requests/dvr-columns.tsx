import { column, type Column } from "@/components/data-table";
import type { DataVerificationRequest } from "@/sdk";

export const dvrColumns: Column<DataVerificationRequest>[] = [
  column.text<DataVerificationRequest>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.text<DataVerificationRequest>({
    id: "created_by",
    header: "Created By",
    accessor: (row) => row.created_by?.name,
    sizing: { role: "person" },
  }),
  column.date<DataVerificationRequest>({
    id: "expires_on",
    header: "Expires",
    accessor: (row) => row.expires_on,
  }),
  column.date<DataVerificationRequest>({
    id: "created_at",
    header: "Created At",
    accessor: (row) => row.created_at,
  }),
  column.date<DataVerificationRequest>({
    id: "updated_at",
    header: "Updated At",
    accessor: (row) => row.updated_at,
  }),
];
