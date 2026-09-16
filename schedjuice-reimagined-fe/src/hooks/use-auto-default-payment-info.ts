"use client";

import { operatorEnum } from "@/types/api";
import type { paymentInfoCreateEditSchema } from "@/types/finance";
import { usePaymentInfosList } from "@/sdk/hooks/payment-infos";
import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type * as z from "zod";

type PaymentInfoCreateForm = UseFormReturn<
  z.infer<typeof paymentInfoCreateEditSchema>
>;

export function shouldAutoDefaultPaymentInfo(existingAccountCount: number): boolean {
  return existingAccountCount === 0;
}

/**
 * When adding a payout account, auto-check Default if the staff member has none yet.
 */
export function useAutoDefaultPaymentInfo(
  form: PaymentInfoCreateForm,
  userId: number | undefined | null,
) {
  const staffIdValid =
    userId != null && Number.isFinite(userId) && Number(userId) > 0;

  const list = usePaymentInfosList({
    enabled: staffIdValid,
    page: 1,
    pageSize: 1,
    sorts: [],
    q: "",
    fields: ["id"],
    filterParams: staffIdValid
      ? [
          {
            field_name: "user_id",
            operator: operatorEnum.exact,
            value: String(userId),
          },
        ]
      : [],
  });

  useEffect(() => {
    if (!staffIdValid || list.isLoading) return;
    form.setValue("is_default", shouldAutoDefaultPaymentInfo(list.total), {
      shouldValidate: true,
      shouldDirty: false,
    });
  }, [form, list.isLoading, list.total, staffIdValid]);
}
