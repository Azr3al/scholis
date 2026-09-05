"use client";

import { getCategoryColumns } from "@/app/(internal)/categories/category-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useTenant } from "@/hooks/useTenant";
import { useCategoriesList } from "@/sdk/hooks/categories";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const CategoryListPage: React.FC = () => {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const isMsEnabled = Boolean(
    tenant?.is_microsoft_on && tenant?.is_teams_creation_enabled,
  );
  const columns = useMemo(
    () => getCategoryColumns(isMsEnabled),
    [isMsEnabled],
  );
  const tableState = useResourceTableState({
    namespace: "categories",
    syncUrl: false,
  });
  const list = useCategoriesList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Categories</h1>
      ),
      actions: (
        <>
          <Link href={`${pathname}/sort-order`}>
            <Button variant="secondary" size="sm">
              Reorder
            </Button>
          </Link>
          <Link href={`${pathname}/create`}>
            <Button size="sm">Create a category</Button>
          </Link>
        </>
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
        columns={columns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `${pathname}/${row.id}`}
      />
    </PageContainer>
  );
};

export default CategoryListPage;
