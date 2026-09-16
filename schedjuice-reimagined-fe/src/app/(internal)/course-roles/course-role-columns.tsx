import { column, type Column } from "@/components/data-table";
import { Badge } from "@/components/courses/ui/badge";
import type { AssignedAsRole } from "@/sdk";

export const courseRoleColumns: Column<AssignedAsRole>[] = [
  column.text<AssignedAsRole>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.status<AssignedAsRole>({
    id: "is_collision_enabled",
    header: "Collision",
    accessor: (row) => (row.is_collision_enabled ? "Enabled" : "Disabled"),
  }),
  {
    id: "is_substitute",
    header: "Substitute",
    accessor: (row) => row.is_substitute,
    sizing: { role: "status" },
    enableSorting: false,
    cell: ({ row }) =>
      row.is_substitute ? (
        <Badge variant="secondary">Substitute</Badge>
      ) : (
        <span className="text-text-muted">—</span>
      ),
  },
];
