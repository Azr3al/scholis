import { column, type Column } from "@/components/data-table";
import type { EmailTemplate } from "@/sdk";

export const emailTemplateColumns: Column<EmailTemplate>[] = [
  column.text<EmailTemplate>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
  }),
  column.text<EmailTemplate>({
    id: "created_by",
    header: "Created By",
    accessor: (row) => row.created_by?.name,
  }),
  column.date<EmailTemplate>({
    id: "created_at",
    header: "Created At",
    accessor: (row) => row.created_at,
  }),
  column.date<EmailTemplate>({
    id: "updated_at",
    header: "Updated At",
    accessor: (row) => row.updated_at,
  }),
];
