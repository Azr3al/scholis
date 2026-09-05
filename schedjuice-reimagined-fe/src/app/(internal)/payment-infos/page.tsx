"use client";

import { paymentInfoColumns } from "@/app/(internal)/payment-infos/payment-info-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/primitives";
import { usePageHeader } from "@/components/shell/use-page-header";
import { useRequireConfigurePaymentInfo } from "@/hooks/use-require-configure-payment-info";
import { usePaymentInfosList } from "@/sdk/hooks/payment-infos";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const PaymentInfoListPage: React.FC = () => {
  const { allowed, isLoading: authLoading } = useRequireConfigurePaymentInfo();
  const pathname = usePathname();
  const tableState = useResourceTableState({
    namespace: "payment-infos",
    syncUrl: false,
    initial: { sorts: ["-updated_at"] },
  });
  const list = usePaymentInfosList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length ? tableState.sorts : ["-updated_at"],
    q: tableState.q,
    expand: ["user"],
    fields: [
      "id",
      "user.id",
      "user.name",
      "account_name",
      "bank_type",
      "description",
      "is_default",
      "updated_at",
    ],
  });

  const headerConfig = useMemo(
    () => ({
      breadcrumb: (
        <h1 className="font-serif text-lg text-text-primary">Payment Info</h1>
      ),
      actions: (
        <Link href={`${pathname}/create`}>
          <Button size="sm">Add payment info</Button>
        </Link>
      ),
    }),
    [pathname],
  );
  usePageHeader(headerConfig);

  if (authLoading || !allowed) {
    return null;
  }

  return (
    <PageContainer width="wide">
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={paymentInfoColumns}
        getRowId={(row) => String(row.id)}
        rowHref={(row) => `${pathname}/${row.id}`}
      />
    </PageContainer>
  );
};

export default PaymentInfoListPage;
