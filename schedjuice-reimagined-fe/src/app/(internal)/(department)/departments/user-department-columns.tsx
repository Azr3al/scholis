import { column, type Column } from "@/components/data-table";
import type { UserDepartment } from "@/sdk";

export const userDepartmentColumns: Column<UserDepartment>[] = [
  column.text<UserDepartment>({
    id: "id",
    header: "ID",
    accessor: (row) => String(row.id),
  }),
  column.text<UserDepartment>({
    id: "user_name",
    header: "User Name",
    accessor: (row) =>
      typeof row.user === "object" ? row.user?.name : null,
  }),
  column.text<UserDepartment>({
    id: "user_email",
    header: "Email",
    accessor: (row) =>
      typeof row.user === "object" ? row.user?.email : null,
  }),
  column.text<UserDepartment>({
    id: "job",
    header: "Job position",
    accessor: (row) => row.job?.name,
  }),
];
