import { column, type Column } from "@/components/data-table";
import type { Department } from "@/sdk";

export const departmentColumns: Column<Department>[] = [
  column.text<Department>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
];
