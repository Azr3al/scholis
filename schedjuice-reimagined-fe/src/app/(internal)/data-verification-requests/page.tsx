"use client";

import { dvrColumns } from "@/app/(internal)/data-verification-requests/dvr-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useDataVerificationRequestsList } from "@/sdk/hooks/data-verification-requests";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const DVRListPage: React.FC = () => {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "data-verification-requests",
    syncUrl: false,
  });
  const list = useDataVerificationRequestsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
    expand: ["created_by"],
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">
          Data Verification Requests
        </h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Create a DVR</Button>
        </Link>
      ),
    }),
    [pathname],
  );
  usePageHeader(headerConfig);

  return (
    <PageContainer width="wide">
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={dvrColumns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `/data-verification-requests/${row.id}`}
      />
    </PageContainer>
  );
};

export default DVRListPage;
