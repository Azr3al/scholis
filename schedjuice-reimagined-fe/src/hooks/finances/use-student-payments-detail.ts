"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { makePostRequest } from "@/app/client-api/utils";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { queryParamDefault } from "@/config/defaults";
import { isPaymentMembershipScoped } from "@/helpers/authorization";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import {
  buildStudentDetailFilterParams,
  sortStudentPaymentDetailRows,
  studentDetailUsesBillingStartDate,
} from "@/lib/finances/student-payments-detail-utils";

export function useStudentPaymentsDetail(
  studentId: string,
  courseId: string,
  monthDate: Date,
) {
  const { user } = useUser();
  const { tenant } = useTenant();

  const filterParams = useMemo(
    () =>
      buildStudentDetailFilterParams(user, studentId, {
        courseId,
        monthDate,
        useBillingStartDate: studentDetailUsesBillingStartDate(
          tenant?.transaction_screenshot_strategy,
        ),
      }),
    [
      user,
      studentId,
      courseId,
      monthDate,
      tenant?.transaction_screenshot_strategy,
    ],
  );

  const enabled =
    Boolean(user) &&
    Boolean(studentId.trim()) &&
    Boolean(courseId) &&
    isValidApiEntityIdParam(String(courseId)) &&
    monthDate instanceof Date &&
    !Number.isNaN(monthDate.getTime()) &&
    (user && isPaymentMembershipScoped(user)
      ? (filterParams.filter_params?.length ?? 0) >= 4
      : (filterParams.filter_params?.length ?? 0) >= 3);

  const query = useQuery({
    queryKey: [
      "student-payments-detail",
      studentId,
      courseId,
      monthDate.getFullYear(),
      monthDate.getMonth(),
      user?.id,
    ],
    queryFn: async () => {
      const sid = studentId.trim();
      const res = await makePostRequest(
        "user-payments/admin-report",
        {
          filter_params: [...(filterParams.filter_params ?? [])],
          exclude_params: [],
        },
        { ...queryParamDefault, size: -1, sorts: ["-billing_start_date"] },
      );
      const raw = res.data?.data;
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : [];
      const rows = list as StudentPaymentAdminReportRow[];
      const scoped =
        sid === ""
          ? rows
          : rows.filter((r) => String(r.user?.id ?? "") === sid);
      return sortStudentPaymentDetailRows(scoped);
    },
    enabled,
  });

  const rows = query.data ?? [];

  const studentName = useMemo(() => {
    const sid = studentId.trim();
    if (!rows.length || !sid) return null;
    const match = rows.find((r) => String(r.user?.id ?? "") === sid);
    return match?.user?.name ?? rows[0]?.user?.name ?? null;
  }, [rows, studentId]);

  return { query, rows, studentName, enabled };
}
