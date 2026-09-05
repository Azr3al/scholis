"use client";

import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import { shouldShowTeamsPaymentAssignmentStatus } from "@/lib/finances/teams-payment-assignment-status";

export type PaymentAssignmentMonthStatusData = {
  assignment_exists: boolean;
  payment_assignment_id: number | null;
  status: string;
  precheck_failure: string | null;
  creation_window_start?: string | null;
  creation_window_end?: string | null;
};

export function usePaymentAssignmentMonthStatus(opts: {
  courseId: string | number | null | undefined;
  monthDate: Date;
  isMicrosoftOn: boolean;
}) {
  const year = opts.monthDate.getFullYear();
  const month = opts.monthDate.getMonth() + 1;
  const courseId = String(opts.courseId ?? "").trim();

  const enabled = shouldShowTeamsPaymentAssignmentStatus({
    isMicrosoftOn: opts.isMicrosoftOn,
    courseId,
  });

  const query = useQuery({
    queryKey: ["payment-assignment-month-status", courseId, year, month],
    enabled,
    queryFn: async () => {
      const res = await axiosClient.get<{
        isError?: boolean;
        message?: string;
        data?: PaymentAssignmentMonthStatusData;
      }>(`courses/${courseId}/payment-assignment-month-status`, {
        params: { year, month },
      });
      const inner = res.data?.data;
      if (res.data?.isError || !inner) {
        throw new Error(
          typeof res.data?.message === "string"
            ? res.data.message
            : "Could not load Teams payment hand-in status.",
        );
      }
      return inner;
    },
  });

  return { enabled, ...query };
}
