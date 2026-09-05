"use client";

import { createPaymentPlanColumns } from "@/app/(internal)/payment-plans/payment-plan-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { usePaymentPlansList } from "@/sdk/hooks/payment-plans";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const PaymentPlanListPage: React.FC = () => {
  const pathname = usePathname();
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const showLegacyDiscountFields = Boolean(tenant?.is_legacy_discount_visible);
  const tableState = useResourceTableState({
    namespace: "payment-plans",
    syncUrl: false,
  });
  const list = usePaymentPlansList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts,
    q: tableState.q,
  });
  const columns = useMemo(
    () =>
      createPaymentPlanColumns({
        showLegacyDiscountFields,
        currencySymbol,
      }),
    [showLegacyDiscountFields, currencySymbol],
  );

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Payment Plans</h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Create a payment plan</Button>
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
        columns={columns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `${pathname}/${row.id}`}
      />
    </PageContainer>
  );
};

export default PaymentPlanListPage;
