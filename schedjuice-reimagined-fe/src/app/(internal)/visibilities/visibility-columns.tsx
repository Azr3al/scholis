import { column, type Column } from "@/components/data-table";
import type { Visibility } from "@/sdk";

export const visibilityColumns: Column<Visibility>[] = [
  column.text<Visibility>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.status<Visibility>({
    id: "role",
    header: "Role",
    accessor: (row) => row.role,
  }),
  column.text<Visibility>({
    id: "created_by",
    header: "Created By",
    accessor: (row) => row.created_by?.name,
    sizing: { role: "person" },
  }),
  column.date<Visibility>({
    id: "created_at",
    header: "Created At",
    accessor: (row) => row.created_at,
  }),
  column.date<Visibility>({
    id: "updated_at",
    header: "Updated At",
    accessor: (row) => row.updated_at,
  }),
];
