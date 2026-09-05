"use client";

import { getDiscountColumns } from "@/app/(internal)/discounts/discount-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useTenant } from "@/hooks/useTenant";
import { useDiscountsList } from "@/sdk/hooks/discounts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const DiscountListPage: React.FC = () => {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const eligibilityEnabled = tenant?.is_discount_eligibility_enabled !== false;
  const discountColumns = useMemo(
    () => getDiscountColumns(eligibilityEnabled),
    [eligibilityEnabled],
  );
  const tableState = useResourceTableState({
    namespace: "discounts",
    syncUrl: false,
  });
  const list = useDiscountsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Discounts</h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Create a discount</Button>
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
        columns={discountColumns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `${pathname}/${row.id}`}
      />
    </PageContainer>
  );
};

export default DiscountListPage;
