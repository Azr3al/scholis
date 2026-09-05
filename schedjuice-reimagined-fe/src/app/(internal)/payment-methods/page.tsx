"use client";

import { createPaymentMethodColumns } from "@/app/(internal)/payment-methods/payment-method-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { canConfigurePaymentInfo } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { usePaymentMethodsList } from "@/sdk/hooks/payment-methods";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const PaymentMethodListPage: React.FC = () => {
  const pathname = usePathname();
  const { user } = useUser();
  const tableState = useResourceTableState({
    namespace: "payment-methods",
    syncUrl: false,
    initial: { sorts: ["name"] },
  });
  const list = usePaymentMethodsList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["name"],
    q: tableState.q,
  });
  const columns = useMemo(
    () =>
      createPaymentMethodColumns({
        canEdit: user ? canConfigurePaymentInfo(user) : false,
      }),
    [user],
  );

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Payment Methods</h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Create a payment method</Button>
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

export default PaymentMethodListPage;
