import { column, type Column } from "@/components/data-table";
import type { Organization } from "@/sdk";

export const organizationColumns: Column<Organization>[] = [
  column.text<Organization>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.text<Organization>({
    id: "domain_url",
    header: "Domain",
    accessor: (row) => row.domain_url,
    sizing: { role: "identifier" },
  }),
];
