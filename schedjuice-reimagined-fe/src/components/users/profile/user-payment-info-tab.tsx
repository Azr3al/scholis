"use client";
import { buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";

import { paymentInfoColumns } from "@/app/(internal)/payment-infos/payment-info-columns";
import {
  ResourceTable,
  useResourceTableState,
} from "@/components/data-table";
import { resolvePaymentInfoRoutes } from "@/helpers/authorization";
import { useUser } from "@/hooks/useUser";
import { operatorEnum } from "@/types/api";
import { usePaymentInfosList } from "@/sdk/hooks/payment-infos";
import Link from "next/link";
import { useMemo } from "react";

type UserPaymentInfoTabProps = {
  userId: string | number;
  canManage: boolean;
};

export function UserPaymentInfoTab({
  userId,
  canManage,
}: UserPaymentInfoTabProps) {
  const { user: viewer } = useUser();
  const subjectUserId = Number(userId);
  const routes = resolvePaymentInfoRoutes(viewer ?? undefined, subjectUserId);
  const canLinkRows =
    viewer != null && (routes.profileScoped || routes.adminScoped);
  const showCreate =
    canManage && viewer != null && routes.createHref != null;

  const tableState = useResourceTableState({
    namespace: `user-payment-info-${userId}`,
    syncUrl: false,
    initial: { sorts: ["-is_default", "-updated_at"] },
  });
  const filterParams = useMemo(
    () => [
      {
        field_name: "user_id",
        operator: operatorEnum.exact,
        value: String(userId),
      },
    ],
    [userId],
  );
  const list = usePaymentInfosList({
    page: tableState.page,
    pageSize: tableState.pageSize,
    sorts: tableState.sorts.length
      ? tableState.sorts
      : ["-is_default", "-updated_at"],
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
    filterParams,
  });

  return (
    <div className="flex flex-col gap-3">
      {showCreate ? (
        <div className="flex justify-end">
          <Link
            href={routes.createHref!}
            className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
          >
            {routes.profileScoped ? "Add payout account" : "Add payment info"}
          </Link>
        </div>
      ) : null}
      <ResourceTable
        list={list}
        tableState={tableState}
        columns={paymentInfoColumns}
        getRowId={(row) => String(row.id)}
        rowHref={
          canLinkRows ? (row) => routes.editHref(row.id)! : undefined
        }
      />
    </div>
  );
}
