"use client";

import { makePostRequest } from "@/app/client-api/utils";
import { useGetAllEntitiesQuery } from "@/components/form/entity-combobox";
import type {
  StudentPaymentAdminReportRow,
  StudentPaymentsAdminReportSummary,
  StudentPaymentsCourseMeta,
  StudentPaymentsCoursePaymentPlan,
} from "@/components/finances/student-payments-report";
import { queryParamDefault } from "@/config/defaults";
import { getCalendarMonthUtcFilterBounds } from "@/helpers/date";
import { isPaymentMembershipScoped } from "@/helpers/authorization";
import { getCourseOfUserFilterParams } from "@/helpers/course";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { resolveMonthDateIfOutsideCourse } from "@/helpers/student-payments-month-eligibility";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { filterParamsBody, operatorEnum } from "@/types/api";
import { TransactionScreenshotStrategy } from "@/types/organization";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  parseAsIsoDateTime,
  parseAsString,
  useQueryState,
} from "nuqs";

export type UseStudentPaymentsAdminReportOptions = {
  fixedCourseId?: string;
  courseMeta?: StudentPaymentsCourseMeta | null;
  globalTransactionLookup?: boolean;
  tableUid: string;
};

export type StudentPaymentsAdminReportModel = {
  rows: StudentPaymentAdminReportRow[];
  setRows: Dispatch<SetStateAction<StudentPaymentAdminReportRow[]>>;
  apiSummary: StudentPaymentsAdminReportSummary | null;
  showSkeleton: boolean;
  isError: boolean;
  isInitialLoading: boolean;
  queryRows: StudentPaymentAdminReportRow[] | null;
  refetch: () => void;
  tableUid: string;
  transactionId: string;
  setTransactionId: (value: string | null) => void;
  status: string | null;
  setStatus: (value: string | null) => void;
  courseIdFromUrl: string;
  setCourseIdFromUrl: (value: string | null) => void;
  date: Date;
  monthDate: Date;
  setDate: (value: Date) => void;
  selectedCourseEntity: StudentPaymentsCourseMeta | null;
  setSelectedCourseEntity: Dispatch<
    SetStateAction<StudentPaymentsCourseMeta | null>
  >;
  effectiveCourseId: string;
  hideCourseColumn: boolean;
  reportFilterParams: filterParamsBody;
  queryEnabled: boolean;
  clearFilters: () => void;
  monthApplicable: boolean;
  suggestedMonth: { year: number; month: number } | null;
  coursePaymentPlan: StudentPaymentsCoursePaymentPlan | null;
};

type CourseListRow = {
  id: number;
  title?: string;
  start_date?: string;
  end_date?: string;
};

export function useStudentPaymentsAdminReport({
  fixedCourseId,
  courseMeta,
  globalTransactionLookup = false,
  tableUid,
}: UseStudentPaymentsAdminReportOptions): StudentPaymentsAdminReportModel {
  const { tenant } = useTenant();
  const { user } = useUser();
  const [transactionIdState, setTransactionIdState] = useQueryState(
    "transactionId",
    parseAsString.withDefault(""),
  );
  const defaultDateParser = useMemo(
    () => parseAsIsoDateTime.withDefault(new Date()),
    [],
  );
  const [dateState, setDateState] = useQueryState("date", defaultDateParser);
  const [courseIdFromUrlState, setCourseIdFromUrlState] = useQueryState(
    "courseId",
    parseAsString.withDefault(""),
  );
  const [statusState, setStatusState] = useQueryState("status", {
    parse: (value) => value,
    defaultValue: null as string | null,
  });

  const [selectedCourseEntity, setSelectedCourseEntity] =
    useState<StudentPaymentsCourseMeta | null>(null);
  const [rows, setRows] = useState<StudentPaymentAdminReportRow[]>([]);
  const [apiSummary, setApiSummary] =
    useState<StudentPaymentsAdminReportSummary | null>(null);
  const [monthApplicable, setMonthApplicable] = useState(true);
  const [suggestedMonth, setSuggestedMonth] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [coursePaymentPlan, setCoursePaymentPlan] =
    useState<StudentPaymentsCoursePaymentPlan | null>(null);

  const initialMonthSnapDoneRef = useRef(false);
  const prevEffectiveCourseIdRef = useRef<string | undefined>(undefined);

  const transactionId = transactionIdState ?? "";
  const date = dateState ?? new Date();
  const courseIdFromUrl = courseIdFromUrlState ?? "";
  const status = statusState;

  const monthDate = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date],
  );

  const effectiveCourseId = fixedCourseId ?? courseIdFromUrl;
  const hideCourseColumn =
    !globalTransactionLookup &&
    (Boolean(String(fixedCourseId ?? "").trim()) ||
      (Boolean(String(courseIdFromUrl ?? "").trim()) &&
        isValidApiEntityIdParam(String(courseIdFromUrl))));

  const reportFilterParams = useMemo((): filterParamsBody => {
    if (!user) return { filter_params: [] };
    const fParams: filterParamsBody = { filter_params: [] };

    if (globalTransactionLookup) {
      if (isPaymentMembershipScoped(user)) {
        fParams.filter_params?.push({
          field_name: "course__user_courses__user_id",
          operator: operatorEnum.exact,
          value: String(user.id),
        });
      }
      const tid = transactionId.trim();
      fParams.filter_params?.push({
        field_name: "transaction_id",
        operator: operatorEnum.exact,
        value: tid || "__student_payments_txn_lookup_placeholder_no_rows__",
      });
      if (status) {
        fParams.filter_params?.push({
          field_name: "status",
          operator: operatorEnum.exact,
          value: status,
        });
      }
      return fParams;
    }

    if (isPaymentMembershipScoped(user)) {
      fParams.filter_params?.push({
        field_name: "course__user_courses__user_id",
        operator: operatorEnum.exact,
        value: String(user.id),
      });
    }
    if (
      effectiveCourseId &&
      isValidApiEntityIdParam(String(effectiveCourseId))
    ) {
      fParams.filter_params?.push({
        field_name: "course_id",
        operator: operatorEnum.exact,
        value: String(Math.trunc(Number(effectiveCourseId))),
      });
    }
    if (transactionId) {
      fParams.filter_params?.push({
        field_name: "transaction_id",
        operator: operatorEnum.contains,
        value: transactionId,
      });
    }
    if (date) {
      let fieldName = "issued_at";
      if (
        tenant?.transaction_screenshot_strategy ===
        TransactionScreenshotStrategy.user_upload
      ) {
        fieldName = "billing_start_date";
      }
      const bounds = getCalendarMonthUtcFilterBounds(date);
      fParams.filter_params?.push(
        {
          field_name: fieldName,
          operator: operatorEnum.gte,
          value: bounds.start.toISOString(),
        },
        {
          field_name: fieldName,
          operator: operatorEnum.lte,
          value: bounds.end.toISOString(),
        },
      );
    }
    if (status) {
      fParams.filter_params?.push({
        field_name: "status",
        operator: operatorEnum.exact,
        value: status,
      });
    }
    return fParams;
  }, [
    user,
    globalTransactionLookup,
    effectiveCourseId,
    transactionId,
    status,
    date,
    tenant?.transaction_screenshot_strategy,
  ]);

  const queryEnabled =
    Boolean(user) &&
    Boolean(tenant) &&
    (globalTransactionLookup
      ? true
      : Boolean(effectiveCourseId) &&
        isValidApiEntityIdParam(String(effectiveCourseId))) &&
    (isPaymentMembershipScoped(user!)
      ? (reportFilterParams.filter_params?.length ?? 0) > 0
      : true);

  const dataQuery = useQuery({
    queryKey: [
      "searchuser-payments",
      tableUid,
      reportFilterParams,
      "admin-report",
      "report",
    ],
    queryFn: async () => {
      const res = await makePostRequest(
        "user-payments/admin-report",
        {
          filter_params: [...(reportFilterParams.filter_params ?? [])],
          exclude_params: [],
        },
        { ...queryParamDefault, size: -1 },
      );
      return {
        rows: (res.data?.data ?? []) as StudentPaymentAdminReportRow[],
        summary: res.data?.summary as
          | StudentPaymentsAdminReportSummary
          | undefined,
        monthApplicable: res.data?.month_applicable !== false,
        suggestedMonth:
          res.data?.suggested_month &&
          typeof res.data.suggested_month.year === "number" &&
          typeof res.data.suggested_month.month === "number"
            ? {
                year: res.data.suggested_month.year,
                month: res.data.suggested_month.month,
              }
            : null,
        coursePaymentPlan: (res.data?.course_payment_plan ??
          null) as StudentPaymentsCoursePaymentPlan | null,
      };
    },
    enabled: queryEnabled,
  });

  const showSkeleton =
    !user || !tenant || (queryEnabled && dataQuery.isInitialLoading);

  const courseStartDate =
    fixedCourseId && courseMeta
      ? courseMeta.start_date
      : selectedCourseEntity?.start_date;
  const courseEndDate =
    fixedCourseId && courseMeta
      ? courseMeta.end_date
      : selectedCourseEntity?.end_date;

  useEffect(() => {
    if (dataQuery.data) {
      if (
        !dataQuery.data.monthApplicable &&
        dataQuery.data.suggestedMonth &&
        !initialMonthSnapDoneRef.current
      ) {
        initialMonthSnapDoneRef.current = true;
        const { year, month } = dataQuery.data.suggestedMonth;
        setDateState(new Date(year, month - 1, 1));
        return;
      }

      if (
        !dataQuery.data.monthApplicable &&
        courseStartDate &&
        courseEndDate &&
        !resolveMonthDateIfOutsideCourse(
          courseStartDate,
          courseEndDate,
          monthDate,
        )
      ) {
        return;
      }

      setRows(dataQuery.data.rows);
      setApiSummary(dataQuery.data.summary ?? null);
      setMonthApplicable(dataQuery.data.monthApplicable);
      setSuggestedMonth(dataQuery.data.suggestedMonth);
      setCoursePaymentPlan(dataQuery.data.coursePaymentPlan);
    }
  }, [
    dataQuery.data,
    setDateState,
    courseStartDate,
    courseEndDate,
    monthDate,
  ]);

  useEffect(() => {
    if (globalTransactionLookup) return;
    if (!courseStartDate || !courseEndDate) return;

    const courseChanged =
      prevEffectiveCourseIdRef.current !== effectiveCourseId;
    prevEffectiveCourseIdRef.current = effectiveCourseId;

    const shouldSnap =
      courseChanged || !initialMonthSnapDoneRef.current;
    if (!shouldSnap) return;

    initialMonthSnapDoneRef.current = true;

    const snapDate = resolveMonthDateIfOutsideCourse(
      courseStartDate,
      courseEndDate,
      monthDate,
    );
    if (snapDate) {
      setDateState(snapDate);
    }
  }, [
    globalTransactionLookup,
    effectiveCourseId,
    courseStartDate,
    courseEndDate,
    monthDate,
    setDateState,
  ]);

  const coursesFilterForSearch = useMemo(() => {
    if (!user) return undefined;
    return { filter_params: getCourseOfUserFilterParams(user).filter_params };
  }, [user]);

  const coursesListQuery = useGetAllEntitiesQuery(
    "courses",
    {
      fields: ["title", "id", "start_date", "end_date"],
      sorts: ["title"],
    },
    coursesFilterForSearch,
    {
      enabled:
        Boolean(user) && !fixedCourseId && !globalTransactionLookup,
    },
  );

  const firstCourseListRow = useMemo(() => {
    const list = coursesListQuery.data?.data?.data as CourseListRow[] | undefined;
    if (!Array.isArray(list) || !list.length) return null;
    const first = list[0];
    return first?.id != null ? first : null;
  }, [coursesListQuery.dataUpdatedAt]);

  useEffect(() => {
    if (fixedCourseId || globalTransactionLookup) return;
    if (courseIdFromUrl) return;
    if (!user || !firstCourseListRow) return;
    void setCourseIdFromUrlState(String(firstCourseListRow.id));
    setSelectedCourseEntity({
      id: firstCourseListRow.id,
      title: firstCourseListRow.title,
      start_date: firstCourseListRow.start_date,
      end_date: firstCourseListRow.end_date,
    });
  }, [
    fixedCourseId,
    globalTransactionLookup,
    courseIdFromUrl,
    user,
    firstCourseListRow,
    setCourseIdFromUrlState,
  ]);

  useEffect(() => {
    if (globalTransactionLookup) return;
    if (fixedCourseId && courseMeta) {
      setSelectedCourseEntity(courseMeta);
      return;
    }
    if (!courseIdFromUrl) {
      setSelectedCourseEntity(null);
    }
  }, [globalTransactionLookup, fixedCourseId, courseMeta, courseIdFromUrl]);

  const setTransactionId = useCallback(
    (value: string | null) => {
      void setTransactionIdState(value ?? "");
    },
    [setTransactionIdState],
  );

  const setStatus = useCallback(
    (value: string | null) => {
      void setStatusState(value);
    },
    [setStatusState],
  );

  const setCourseIdFromUrl = useCallback(
    (value: string | null) => {
      void setCourseIdFromUrlState(value ?? "");
    },
    [setCourseIdFromUrlState],
  );

  const setDate = useCallback(
    (value: Date) => {
      void setDateState(value);
    },
    [setDateState],
  );

  const refetch = useCallback(() => {
    void dataQuery.refetch();
  }, [dataQuery]);

  const clearFilters = useCallback(() => {
    setTransactionId("");
    setStatus(null);
    if (!globalTransactionLookup) setDate(new Date());
    // Keep course scope — clearing it would re-enable org-wide dumps before
    // auto-select runs. Course is required for admin-report.
  }, [
    globalTransactionLookup,
    setDate,
    setStatus,
    setTransactionId,
  ]);

  return {
    rows,
    setRows,
    apiSummary,
    showSkeleton,
    isError: dataQuery.isError,
    isInitialLoading: dataQuery.isInitialLoading,
    queryRows: dataQuery.data?.rows ?? null,
    refetch,
    tableUid,
    transactionId,
    setTransactionId,
    status,
    setStatus,
    courseIdFromUrl,
    setCourseIdFromUrl,
    date,
    monthDate,
    setDate,
    selectedCourseEntity,
    setSelectedCourseEntity,
    effectiveCourseId,
    hideCourseColumn,
    reportFilterParams,
    queryEnabled,
    clearFilters,
    monthApplicable,
    suggestedMonth,
    coursePaymentPlan,
  };
}
