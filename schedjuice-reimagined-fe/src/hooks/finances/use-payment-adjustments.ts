"use client";

import { deleteEntity, makeGetRequest } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import { queryClient } from "@/lib/query";
import { softRefetchStudentPaymentsReport } from "@/lib/finances/soft-refetch-student-payments-report";
import { useMutation, useQuery } from "@tanstack/react-query";

export type PaymentAdjustmentKind = "refund" | "re_transfer";

export type PaymentAdjustmentImage = {
  id: number;
  filename: string;
  image_url: string | null;
  created_at: string;
};

export type PaymentAdjustment = {
  id: number;
  kind: PaymentAdjustmentKind;
  amount: string;
  occurred_at: string;
  note: string | null;
  images: PaymentAdjustmentImage[];
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
};

export type CreatePaymentAdjustmentInput = {
  kind: PaymentAdjustmentKind;
  amount: string;
  occurredAt: string;
  note?: string;
  files: File[];
};

function paymentAdjustmentsQueryKey(paymentId: number) {
  return ["user-payment-adjustments", paymentId] as const;
}

export function buildPaymentAdjustmentFormData(
  input: CreatePaymentAdjustmentInput,
): FormData {
  const fd = new FormData();
  fd.append("kind", input.kind);
  fd.append("amount", input.amount);
  fd.append("occurred_at", input.occurredAt);
  if (input.note?.trim()) {
    fd.append("note", input.note.trim());
  }
  input.files.forEach((file, index) => {
    fd.append(`image_${index}`, file);
  });
  return fd;
}

async function fetchPaymentAdjustments(
  paymentId: number,
): Promise<PaymentAdjustment[]> {
  const res = await makeGetRequest(`user-payments/${paymentId}/adjustments`);
  return (res.data?.data ?? []) as PaymentAdjustment[];
}

export function usePaymentAdjustments(
  paymentId: number | null,
  options?: { tableUid?: string },
) {
  const enabled = paymentId != null && paymentId > 0;

  const listQuery = useQuery({
    queryKey: paymentId != null ? paymentAdjustmentsQueryKey(paymentId) : ["user-payment-adjustments", "idle"],
    queryFn: () => fetchPaymentAdjustments(paymentId!),
    enabled,
  });

  const invalidate = async () => {
    if (paymentId == null) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: paymentAdjustmentsQueryKey(paymentId),
      }),
      softRefetchStudentPaymentsReport(queryClient, {
        tableUid: options?.tableUid,
      }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: CreatePaymentAdjustmentInput) => {
      if (paymentId == null) {
        return Promise.reject(new Error("Missing payment id"));
      }
      const fd = buildPaymentAdjustmentFormData(input);
      return axiosClient.post(`user-payments/${paymentId}/adjustments`, fd);
    },
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (adjustmentId: number) =>
      deleteEntity("payment-adjustments", adjustmentId),
    onSuccess: () => invalidate(),
  });

  return {
    listQuery,
    createMutation,
    deleteMutation,
  };
}
