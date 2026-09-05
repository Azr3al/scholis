"use client";

import type { ResourceListResult } from "@/components/data-table/types";
import { useToast } from "@/components/primitives";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { StaffPayment } from "../_types/staff-payments";
import type { SearchListArgs } from "../core/define-search-list";
import { useSearchListQuery } from "../core/define-search-list-hook";
import {
  confirmStaffPayment,
  staffPaymentsSearch,
} from "../resources/staff-payments";

export type UseStaffPaymentsListArgs = SearchListArgs & {
  enabled?: boolean;
};

export function useStaffPaymentsList(
  args: UseStaffPaymentsListArgs,
): ResourceListResult<StaffPayment> {
  return useSearchListQuery(staffPaymentsSearch, args);
}

export function useConfirmStaffPayment() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: number) => confirmStaffPayment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-payments"] });
      toast.add({
        type: "success",
        description:
          "Payment confirmed. Thanks for letting us know you received it.",
      });
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not confirm this payment. Try again.",
      });
    },
  });
}
