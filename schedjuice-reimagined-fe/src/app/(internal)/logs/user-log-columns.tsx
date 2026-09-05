import { column, type Column } from "@/components/data-table";
import { Button } from "@/components/primitives";
import { isStaffRoles, isStudentRoles } from "@/lib/user-logs/applies-to";
import type { User } from "@/sdk";

export type UserLogRow = Pick<User, "id" | "name" | "email" | "roles">;

export function createUserLogColumns(opts: {
  onViewLogs: (user: UserLogRow) => void;
}): Column<UserLogRow>[] {
  return [
    column.text<UserLogRow>({
      id: "name",
      header: "Name",
      accessor: (row) => row.name,
      sizing: { role: "person" },
    }),
    column.text<UserLogRow>({
      id: "email",
      header: "Email",
      accessor: (row) => row.email,
      sizing: { role: "identifier" },
    }),
    column.status<UserLogRow>({
      id: "category",
      header: "Category",
      accessor: (row) => {
        const roles = row.roles ?? [];
        if (isStudentRoles(roles) && !isStaffRoles(roles)) return "Student";
        if (isStaffRoles(roles)) return "Staff";
        return null;
      },
    }),
    {
      id: "open",
      header: "",
      accessor: () => null,
      enableSorting: false,
      sizing: { role: "action" },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            opts.onViewLogs({
              id: row.id,
              name: row.name,
              email: row.email,
              roles: row.roles ?? [],
            })
          }
        >
          View logs
        </Button>
      ),
    },
  ];
}
