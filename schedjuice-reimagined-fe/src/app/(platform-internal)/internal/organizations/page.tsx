"use client";

import { organizationColumns } from "@/app/(platform-internal)/internal/organizations/organization-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { PageSection } from "@/components/layout/page-section";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useOrganizationsList } from "@/sdk/hooks/organizations";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const OrganizationListPage: React.FC = () => {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "organizations",
    syncUrl: false,
  });
  const list = useOrganizationsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Organizations</h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Create</Button>
        </Link>
      ),
    }),
    [pathname],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="default">
      <PageSection dominant>
        <ResourceTable
          list={list}
          tableState={tableState}
          columns={organizationColumns}
          getRowId={(row) => String(row.id)}
          rowHref={(row) => `/internal/organizations/${row.id}`}
        />
      </PageSection>
    </PageContainer>
  );
};

export default OrganizationListPage;
