import { column, type Column } from "@/components/data-table";
import type { Campus } from "@/sdk";

export const campusColumns: Column<Campus>[] = [
  column.text<Campus>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.text<Campus>({
    id: "description",
    header: "Description",
    accessor: (row) => row.description,
    sizing: { role: "prose" },
  }),
  column.text<Campus>({
    id: "location",
    header: "Location",
    accessor: (row) => row.location,
    sizing: { role: "identifier" },
  }),
  column.status<Campus>({
    id: "is_online",
    header: "Online",
    accessor: (row) => (row.is_online ? "Yes" : "No"),
  }),
  column.status<Campus>({
    id: "is_default",
    header: "Default",
    accessor: (row) => (row.is_default ? "Yes" : "No"),
  }),
];
