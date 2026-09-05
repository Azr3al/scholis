"use client";

import { visibilityColumns } from "@/app/(internal)/visibilities/visibility-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useVisibilitiesList } from "@/sdk/hooks/visibilities";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const VisibilityListPage = () => {
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "visibilities",
    syncUrl: false,
  });
  const list = useVisibilitiesList({
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
          Visibility Settings
        </h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Create visibility setting</Button>
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
        columns={visibilityColumns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `${pathname}/${row.id}`}
      />
    </PageContainer>
  );
};

export default VisibilityListPage;
