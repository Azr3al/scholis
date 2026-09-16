import { column, type Column } from "@/components/data-table";
import type { OrganizationAdmin } from "@/sdk";

export const organizationAdminColumns: Column<OrganizationAdmin>[] = [
  column.text<OrganizationAdmin>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
  }),
  column.text<OrganizationAdmin>({
    id: "email",
    header: "Email",
    accessor: (row) => row.email,
  }),
];
