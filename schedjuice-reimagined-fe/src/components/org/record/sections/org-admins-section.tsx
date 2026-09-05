"use client";
import { Button } from "@/components/primitives";

import { organizationAdminColumns } from "@/components/org/record/sections/organization-admin-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { useOrganizationAdminsList } from "@/sdk/hooks/organization-admins";
import Link from "next/link";
import { OrgSectionPanel } from "./org-section-panel";

export function OrgAdminsSection({ orgId }: { orgId: string | number }) {
  const tableState = useResourceTableState({
    namespace: "admin-list",
    syncUrl: false,
  });
  const list = useOrganizationAdminsList({
    orgId,
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  return (
    <OrgSectionPanel
      title="Admins"
      description="Organization administrators for this school."
      footer={
        <Link href={`/internal/organizations/${orgId}/admins/create`}>
          <Button type="button">Add admin</Button>
        </Link>
      }
    >
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={organizationAdminColumns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `/organizations/admins/${row.id}`}
      />
    </OrgSectionPanel>
  );
}
