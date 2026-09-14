"use client";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  appendDiscountSelectionToFormData,
  PaymentDiscountPicker,
  PaymentDiscountPickerSkeleton,
  type PaymentDiscountSelection,
} from "@/components/finance/payment-discount-picker";
import { makePostRequest, fetchEntity, searchEntities } from "@/app/client-api/utils";
import { axiosClient } from "@/lib/api";
import { operatorEnum } from "@/types/api";
import { DatePicker } from "@/components/date/date-picker";
import EntityCombobox from "@/components/form/entity-combobox";
import FileDragAndDrop, { extendedFileType } from "@/components/form/file-drag-and-drop";
import { CoverageFields } from "@/components/finances/payment-upload/coverage-fields";
import { SkipScreenshotCheckbox } from "@/components/finances/payment-upload/skip-screenshot-checkbox";
import {
  getCalendarMonthUtcFilterBounds,
} from "@/helpers/date";
import { monthKey } from "@/helpers/payment-coverage-months";
import { getTenantDayBoundariesIso, getTenantTodayYmd } from "@/helpers/shortcuts-time";
import { formatInTimeZone } from "date-fns-tz";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { formatPaymentMethodDisplayName } from "@/helpers/payment-method-display";
import { isPaymentMembershipScoped } from "@/helpers/authorization";
import { formatMoney } from "@/helpers/money";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import {
  buildMultiPartPaymentFormData,
  sumPartAmounts,
} from "@/lib/finances/payment-group-utils";
import {
  computeRemainingAmount,
  resolveSelectedDiscountSnapshots,
  resolveTermFeeFromDiscounts,
} from "@/lib/finances/remaining-amount";
import {
  courseHasBillablePaymentPlan,
  currentDiscountTemplateIds,
  resolveUploadDiscountSectionView,
  searchUploadEnrollment,
} from "@/lib/finances/upload-enrollment";
import { UploadFieldError } from "@/components/finances/upload-field-error";
import {
  uploadFormActionsClassName,
  uploadPartFieldDataName,
  uploadPartFieldRootClassName,
  uploadPartScreenshotStackClassName,
  uploadPartSectionClassName,
} from "@/lib/finances/upload-form-layout";
import {
  getFirstUploadErrorFieldName,
  scrollToFirstUploadError,
  type PartFieldKey,
  type UploadFieldErrors,
  validateUploadForm,
} from "@/lib/finances/upload-part-validation";
import {
  createEmptyCoveragePlan,
  defaultCoveragePlanForCourse,
  resolveCoveragePayload,
  selectableMonthsFromCourseDates,
  type PaymentPlanMode,
} from "@/lib/finances/payment-coverage-plan";
import { PaymentScreenshotPreview } from "@/components/finances/payment-screenshot-preview";
import {
  OCR_FIELD_EXTRACTING_MESSAGE,
  OCR_READ_ERROR_MESSAGE,
} from "@/lib/finances/ocr-payment-screenshot";
import { Button, Field, Input, Skeleton, useToast } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { DefaultStudentPaymentPlan } from "@/types/organization";
import type { CoveragePlanState } from "@/lib/finances/payment-coverage-plan";
import { Discount, DiscountEligibilityType, UserPayment } from "@/types/finance";
import { useMutation, useQuery } from "@tanstack/react-query";
import { NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { useRouter, useSearchParams } from "next/navigation";
import { parseAsIsoDateTime, parseAsString, useQueryState } from "nuqs";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type UploadPart = {
  key: string;
  files: extendedFileType[];
  parsedAmount: string;
  paymentMethodId: string;
  transactionId: string;
  dateOnScreenshot: string;
  paymentDate: Date;
  description: string;
  remarks: string;
  ocrEventId?: string;
  ocrStatus: "idle" | "loading" | "success" | "error";
  ocrError?: string;
  duplicateWarningId?: number | null;
};

let uploadPartKeySequence = 0;

function createUploadPart(paymentMethodId = "", paymentDate = new Date()): UploadPart {
  uploadPartKeySequence += 1;
  return {
    key: `upload-part-${uploadPartKeySequence}`,
    files: [],
    parsedAmount: "",
    paymentMethodId,
    transactionId: "",
    dateOnScreenshot: "",
    paymentDate,
    description: "",
    remarks: "",
    ocrStatus: "idle",
    duplicateWarningId: null,
  };
}

function getLocalFile(part: UploadPart): File | null {
  const first = part.files[0];
  return first && "file" in first ? first.file : null;
}

function parseOcrString(value: unknown): string {
  return value == null ? "" : String(value);
}

function parseDuplicatePaymentId(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseSuggestedPaymentMethodId(value: unknown): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : "";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "response" in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

function isPaymentPlanMode(value: string): value is PaymentPlanMode {
  return (
    value === DefaultStudentPaymentPlan.single_month ||
    value === DefaultStudentPaymentPlan.multiple_months ||
    value === DefaultStudentPaymentPlan.installment
  );
}

const StudentPaymentUploadPageInner = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { user } = useUser();
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const tenantTimezone = tenant?.timezone?.trim() || "UTC";
  const tenantToday = useMemo(() => {
    const ymd = getTenantTodayYmd(tenantTimezone);
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [tenantTimezone]);
  const defaultDateParser = useMemo(
    () => parseAsIsoDateTime.withDefault(new Date()),
    [],
  );
  const [date, setDate] = useQueryState("date", defaultDateParser);
  const [courseId] = useQueryState("courseId", parseAsString.withDefault(""));
  const [userId] = useQueryState("userId", parseAsString.withDefault(""));

  const defaultPlan = useMemo((): PaymentPlanMode => {
    const raw = tenant?.default_student_payment_plan;
    if (raw && isPaymentPlanMode(raw)) return raw;
    return DefaultStudentPaymentPlan.single_month;
  }, [tenant?.default_student_payment_plan]);

  const [coveragePlan, setCoveragePlan] = useState<CoveragePlanState>(() =>
    createEmptyCoveragePlan(new Date()),
  );
  const [planInitialized, setPlanInitialized] = useState(false);
  const [parts, setParts] = useState<UploadPart[]>(() => [createUploadPart()]);
  const [skipScreenshotUpload, setSkipScreenshotUpload] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<UploadFieldErrors>({ parts: {} });
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [discountSelection, setDiscountSelection] =
    useState<PaymentDiscountSelection>({
      discountIds: [],
    });
  const ocrRequestIdsRef = useRef<Record<string, number>>({});
  const shouldScrollToErrorsRef = useRef(false);

  useEffect(() => {
    if (!shouldScrollToErrorsRef.current) return;
    const fieldName = getFirstUploadErrorFieldName(
      fieldErrors,
      parts.map((part) => part.key),
    );
    if (!fieldName) return;
    shouldScrollToErrorsRef.current = false;
    scrollToFirstUploadError(fieldName);
  }, [fieldErrors, parts]);

  const clearPartFieldError = useCallback((partKey: string, field: PartFieldKey) => {
    setFieldErrors((prev) => {
      const partErrs = prev.parts[partKey];
      if (!partErrs?.[field]) return prev;
      const nextPart = { ...partErrs };
      delete nextPart[field];
      const nextParts = { ...prev.parts };
      if (Object.keys(nextPart).length === 0) {
        delete nextParts[partKey];
      } else {
        nextParts[partKey] = nextPart;
      }
      return { ...prev, parts: nextParts };
    });
  }, []);

  const clearPlanFieldError = useCallback(() => {
    setFieldErrors((prev) => (prev.plan ? { ...prev, plan: undefined } : prev));
  }, []);

  const clearFormFieldError = useCallback(() => {
    setFieldErrors((prev) => (prev.form ? { ...prev, form: undefined } : prev));
  }, []);

  const PART_FIELD_TO_ERROR_KEY: Partial<Record<keyof UploadPart, PartFieldKey>> =
    {
      paymentMethodId: "paymentMethodId",
      parsedAmount: "parsedAmount",
      transactionId: "transactionId",
    };

  useEffect(() => {
    if (planInitialized || !tenant) return;
    setCoveragePlan((prev) => ({
      ...prev,
      mode: defaultPlan,
    }));
    setPlanInitialized(true);
  }, [defaultPlan, planInitialized, tenant]);

  const monthDate = useMemo(
    () =>
      new Date(
        coveragePlan.monthDate.getFullYear(),
        coveragePlan.monthDate.getMonth(),
        1,
      ),
    [coveragePlan.monthDate],
  );

  const listHref = useMemo(() => {
    const dateParam = searchParams.get("date");
    const returnQuery = new URLSearchParams();
    if (dateParam) returnQuery.set("date", dateParam);

    const cid = courseId.trim();
    const returnToCourse =
      Boolean(cid) &&
      isValidApiEntityIdParam(cid) &&
      (searchParams.get("returnTo") === "course" ||
        (user != null && isPaymentMembershipScoped(user)));

    if (returnToCourse) {
      return `/courses/${cid}/student-payments?${returnQuery.toString()}`;
    }

    const financesQuery = new URLSearchParams(searchParams.toString());
    financesQuery.delete("userId");
    financesQuery.delete("returnTo");
    return `/finances/student-payments?${financesQuery.toString()}`;
  }, [courseId, searchParams, user]);

  const submitMutation = useMutation({
    mutationFn: (data: FormData) =>
      makePostRequest(
        "scan-transaction-screenshots",
        data,
        {},
        { "Content-Type": "multipart/form-data" },
      ),
    onSuccess: () => {
      toast.add({ description: "Payment saved." });
      router.push(listHref);
    },
    onError: (error: unknown) => {
      toast.add({
        description: getErrorMessage(error, "Could not save payment."),
      });
    },
  });

  const isSaving = submitMutation.isPending;
  const hasOcrLoading = parts.some((part) => part.ocrStatus === "loading");
  const totalAmount = useMemo(
    () =>
      sumPartAmounts(
        parts.map((part) => {
          const amount = Number.parseFloat(part.parsedAmount);
          return { amount: Number.isFinite(amount) ? amount : null };
        }),
      ),
    [parts],
  );

  const updatePart = <K extends keyof UploadPart>(
    key: string,
    field: K,
    value: UploadPart[K],
  ) => {
    setParts((prev) =>
      prev.map((part) =>
        part.key === key ? { ...part, [field]: value } : part,
      ),
    );
    const errorKey = PART_FIELD_TO_ERROR_KEY[field];
    if (errorKey) {
      clearPartFieldError(key, errorKey);
    }
  };

  const runOcrForPart = async (
    partKey: string,
    file: File,
    requestId: number,
  ) => {
    const fd = new FormData();
    fd.append("screenshot", file);

    try {
      const res = await makePostRequest(
        "ocr-payment-screenshot",
        fd,
        {},
        { "Content-Type": "multipart/form-data" },
      );
      if (ocrRequestIdsRef.current[partKey] !== requestId) return;

      const body = res.data as {
        isError?: boolean;
        message?: string;
        data?: unknown;
        transaction_id?: unknown;
        parsed_amount?: unknown;
        date_on_screenshot?: unknown;
        duplicate_of_payment_id?: unknown;
        suggested_payment_method_id?: unknown;
        ocr_event_id?: unknown;
      };
      if (body?.isError) {
        throw new Error(body.message ?? "Could not read this screenshot.");
      }
      const payload =
        body?.data && typeof body.data === "object"
          ? (body.data as {
              transaction_id?: unknown;
              parsed_amount?: unknown;
              date_on_screenshot?: unknown;
              duplicate_of_payment_id?: unknown;
              suggested_payment_method_id?: unknown;
              ocr_event_id?: unknown;
            })
          : body;

      const suggestedPaymentMethodId = parseSuggestedPaymentMethodId(
        payload.suggested_payment_method_id,
      );

      setParts((prev) =>
        prev.map((part) => {
          if (
            part.key !== partKey ||
            ocrRequestIdsRef.current[partKey] !== requestId
          ) {
            return part;
          }
          return {
            ...part,
            transactionId: parseOcrString(payload.transaction_id),
            parsedAmount: parseOcrString(payload.parsed_amount),
            dateOnScreenshot: parseOcrString(payload.date_on_screenshot),
            paymentMethodId: suggestedPaymentMethodId,
            duplicateWarningId: parseDuplicatePaymentId(
              payload.duplicate_of_payment_id,
            ),
            ocrEventId: parseOcrString(payload.ocr_event_id) || undefined,
            ocrStatus: "success",
            ocrError: undefined,
          };
        }),
      );
      if (suggestedPaymentMethodId) {
        clearPartFieldError(partKey, "paymentMethodId");
      }
    } catch {
      if (ocrRequestIdsRef.current[partKey] !== requestId) return;
      setParts((prev) =>
        prev.map((part) =>
          part.key === partKey
            ? {
                ...part,
                ocrStatus: "error",
                ocrError: OCR_READ_ERROR_MESSAGE,
                duplicateWarningId: null,
              }
            : part,
        ),
      );
    }
  };

  const setPartFiles = (partKey: string, files: extendedFileType[]) => {
    const first = files[0];
    const localFile = first && "file" in first ? first.file : null;
    const isNewUpload = Boolean(localFile);
    const isClearing = files.length === 0;
    const resetOcrFields = isNewUpload || isClearing;
    if (localFile) {
      setSkipScreenshotUpload(false);
    }
    const requestId = (ocrRequestIdsRef.current[partKey] ?? 0) + 1;
    ocrRequestIdsRef.current[partKey] = requestId;

    setParts((prev) =>
      prev.map((part) =>
        part.key === partKey
          ? {
              ...part,
              files,
              parsedAmount: resetOcrFields ? "" : part.parsedAmount,
              transactionId: resetOcrFields ? "" : part.transactionId,
              dateOnScreenshot: resetOcrFields ? "" : part.dateOnScreenshot,
              paymentMethodId: resetOcrFields ? "" : part.paymentMethodId,
              ocrEventId: resetOcrFields ? undefined : part.ocrEventId,
              ocrStatus: isNewUpload ? "loading" : isClearing ? "idle" : part.ocrStatus,
              ocrError: resetOcrFields ? undefined : part.ocrError,
              duplicateWarningId: resetOcrFields ? null : part.duplicateWarningId,
            }
          : part,
      ),
    );

    clearPartFieldError(partKey, "screenshot");

    if (isClearing) {
      clearPartFieldError(partKey, "parsedAmount");
      clearPartFieldError(partKey, "transactionId");
      clearPartFieldError(partKey, "paymentMethodId");
      return;
    }

    if (localFile) {
      clearPartFieldError(partKey, "paymentMethodId");
      void runOcrForPart(partKey, localFile, requestId);
    }
  };

  const clearScreenshotPart = (partKey: string) => {
    setPartFiles(partKey, []);
  };

  const addPart = () => {
    setSkipScreenshotUpload(false);
    setParts((prev) => [
      ...prev,
      createUploadPart(prev[0]?.paymentMethodId ?? "", tenantToday),
    ]);
  };

  const removePart = (partKey: string) => {
    ocrRequestIdsRef.current[partKey] =
      (ocrRequestIdsRef.current[partKey] ?? 0) + 1;
    setParts((prev) =>
      prev.length > 1 ? prev.filter((part) => part.key !== partKey) : prev,
    );
  };

  const courseQuery = useQuery({
    queryKey: ["course-upload-meta", courseId],
    enabled:
      Boolean(courseId) && isValidApiEntityIdParam(String(courseId).trim()),
    queryFn: async () => {
      const res = await fetchEntity("courses", Number(courseId), [
        "payment_plan",
      ]);
      const body = res.data as {
        isError?: boolean;
        message?: string;
        data?: {
          id?: number;
          start_date?: string | null;
          end_date?: string | null;
          title?: string;
          payment_plan?:
            | number
            | {
                id?: number;
                price?: string | number | null;
                billing_type?: string | null;
              }
            | null;
        };
      };
      if (body.isError || body.data == null) {
        throw new Error(body.message ?? "Could not load course.");
      }
      return body.data;
    },
  });

  const courseHasPaymentPlan = useMemo(
    () => courseHasBillablePaymentPlan(courseQuery.data?.payment_plan),
    [courseQuery.data?.payment_plan],
  );

  const selectableMonths = useMemo(
    () =>
      selectableMonthsFromCourseDates(
        courseQuery.data?.start_date,
        courseQuery.data?.end_date ?? courseQuery.data?.start_date,
      ),
    [courseQuery.data],
  );

  const selectableMonthKeys = useMemo(
    () => selectableMonths.map((m) => monthKey(m.year, m.month_index)),
    [selectableMonths],
  );

  useEffect(() => {
    if (!courseQuery.data?.start_date) return;
    const anchor = date ?? new Date();
    setCoveragePlan((prev) =>
      defaultCoveragePlanForCourse(
        courseQuery.data?.start_date,
        courseQuery.data?.end_date ?? courseQuery.data?.start_date,
        anchor,
      ),
    );
  }, [courseQuery.data?.id, courseQuery.data?.start_date, courseQuery.data?.end_date]);

  useEffect(() => {
    if (
      coveragePlan.mode !== DefaultStudentPaymentPlan.multiple_months ||
      selectableMonths.length === 0
    ) {
      return;
    }
    const key = monthKey(monthDate.getFullYear(), monthDate.getMonth() + 1);
    setCoveragePlan((prev) => ({
      ...prev,
      selectedMonthKeys: new Set([key]),
    }));
  }, [coveragePlan.mode, monthDate.getTime(), selectableMonths]);

  useEffect(() => {
    if (
      coveragePlan.mode !== DefaultStudentPaymentPlan.installment ||
      selectableMonths.length === 0
    ) {
      return;
    }
    const key = monthKey(monthDate.getFullYear(), monthDate.getMonth() + 1);
    setCoveragePlan((prev) => ({
      ...prev,
      installmentThroughKey: prev.installmentThroughKey || key,
    }));
  }, [coveragePlan.mode, monthDate.getTime(), selectableMonths]);

  const planPrice = useMemo(() => {
    const plan = courseQuery.data?.payment_plan;
    if (plan == null || typeof plan === "number") return null;
    const price = plan.price;
    if (price == null) return null;
    const parsed = Number(price);
    return Number.isFinite(parsed) ? parsed : null;
  }, [courseQuery.data?.payment_plan]);

  const planBillingType = useMemo(() => {
    const plan = courseQuery.data?.payment_plan;
    if (plan == null || typeof plan === "number") return null;
    return plan.billing_type ?? null;
  }, [courseQuery.data?.payment_plan]);

  useEffect(() => {
    if (!searchParams.get("date")) {
      setDate(new Date());
    }
  }, [searchParams, setDate]);

  useEffect(() => {
    if (!date) return;
    setCoveragePlan((prev) => ({
      ...prev,
      monthDate: new Date(date.getFullYear(), date.getMonth(), 1),
    }));
  }, [date?.getTime()]);

  useEffect(() => {
    if (!hasOcrLoading) {
      clearFormFieldError();
    }
  }, [hasOcrLoading, clearFormFieldError]);

  const invalidContext =
    !courseId.trim() ||
    !userId.trim() ||
    !isValidApiEntityIdParam(courseId.trim()) ||
    !isValidApiEntityIdParam(userId.trim());

  const userPaymentsQuery = useQuery({
    queryKey: ["upload-user-payments", userId, courseId],
    enabled: !invalidContext,
    queryFn: async () => {
      const res = await searchEntities(
        "user-payments",
        { size: -1 },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: String(userId.trim()),
            },
            {
              field_name: "course_id",
              operator: operatorEnum.exact,
              value: String(courseId.trim()),
            },
          ],
        },
      );
      return (res.data?.data ?? []) as UserPayment[];
    },
  });

  const enrollmentQuery = useQuery({
    queryKey: ["upload-enrollment", userId, courseId],
    enabled: !invalidContext && courseHasPaymentPlan,
    queryFn: () => searchUploadEnrollment(userId, courseId),
  });

  const billingAsOf = monthDate.toISOString().slice(0, 10);
  const enrollmentId = enrollmentQuery.data?.id;

  const eligibleDiscountsQuery = useQuery({
    queryKey: ["eligible-discounts", enrollmentId, billingAsOf],
    enabled: enrollmentId != null,
    queryFn: async () => {
      const res = await axiosClient.get(
        `user-courses/${enrollmentId}/eligible-discounts`,
        { params: { as_of: billingAsOf } },
      );
      return res.data?.data as {
        current:
          | {
              discount?: number | null;
              snapshot_discount_type: string;
              snapshot_scope: string;
              snapshot_percent_value?: string | null;
              snapshot_fixed_amount?: string | null;
              discount_name?: string | null;
            }
          | Array<{
              discount?: number | null;
              snapshot_discount_type: string;
              snapshot_scope: string;
              snapshot_percent_value?: string | null;
              snapshot_fixed_amount?: string | null;
              discount_name?: string | null;
            }>
          | null;
        discounts: Discount[];
      };
    },
  });

  const eligibleDiscountOptions = useMemo(() => {
    const list = [...(eligibleDiscountsQuery.data?.discounts ?? [])];
    const raw = eligibleDiscountsQuery.data?.current;
    const currents = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    for (const current of currents) {
      if (
        current?.discount != null &&
        !list.some((discount) => discount.id === current.discount)
      ) {
        list.unshift({
          id: current.discount,
          name: current.discount_name ?? `Discount #${current.discount}`,
          discount_type: current.snapshot_discount_type as Discount["discount_type"],
          percent_value: current.snapshot_percent_value
            ? Number(current.snapshot_percent_value)
            : null,
          fixed_amount: current.snapshot_fixed_amount
            ? Number(current.snapshot_fixed_amount)
            : null,
          scope: current.snapshot_scope as Discount["scope"],
          eligibility_type: DiscountEligibilityType.none,
          is_active: true,
        });
      }
    }
    return list;
  }, [eligibleDiscountsQuery.data]);

  const selectedDiscountSnapshots = useMemo(
    () =>
      resolveSelectedDiscountSnapshots({
        discountIds: discountSelection.discountIds,
        discounts: eligibleDiscountOptions,
      }),
    [discountSelection.discountIds, eligibleDiscountOptions],
  );

  const termFee = useMemo(
    () =>
      resolveTermFeeFromDiscounts({
        planPrice,
        periodCount: selectableMonths.length,
        billingType: planBillingType,
        selectedDiscounts: selectedDiscountSnapshots,
      }),
    [
      planPrice,
      selectableMonths.length,
      planBillingType,
      selectedDiscountSnapshots,
    ],
  );

  const remainingAmount = useMemo(
    () =>
      computeRemainingAmount({
        termFee,
        payments: userPaymentsQuery.data ?? [],
        currentPaymentAmount: totalAmount,
      }),
    [termFee, userPaymentsQuery.data, totalAmount],
  );

  const discountSectionView = resolveUploadDiscountSectionView({
    invalidContext,
    courseLoading: courseQuery.isLoading,
    courseHasPaymentPlan,
    enrollmentLoading: enrollmentQuery.isLoading,
    enrollmentError: enrollmentQuery.isError,
    enrollmentId,
  });

  const remainingAmountLoading =
    courseQuery.isLoading ||
    userPaymentsQuery.isLoading ||
    (courseHasPaymentPlan && enrollmentQuery.isLoading) ||
    (enrollmentId != null && eligibleDiscountsQuery.isLoading);

  useEffect(() => {
    if (eligibleDiscountsQuery.data == null) return;
    const templateIds = currentDiscountTemplateIds(
      eligibleDiscountsQuery.data.current,
    );
    setDiscountSelection({ discountIds: templateIds });
  }, [eligibleDiscountsQuery.data, eligibleDiscountsQuery.dataUpdatedAt]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (invalidContext) return;

    const validation = validateUploadForm({
      parts: parts.map((part) => ({
        key: part.key,
        hasFile: Boolean(getLocalFile(part)),
        skipScreenshot: skipScreenshotUpload && parts.length === 1,
        parsedAmount: part.parsedAmount,
        paymentMethodId: part.paymentMethodId,
        transactionId: part.transactionId,
      })),
      partKeys: parts.map((part) => part.key),
      hasOcrLoading,
      isValidPaymentMethodId: isValidApiEntityIdParam,
      paymentPlan: coveragePlan.mode,
      multipleMonthsSelectedCount: coveragePlan.selectedMonthKeys.size,
      installmentThroughKey: coveragePlan.installmentThroughKey,
      selectableMonthKeys,
    });

    if (validation.hasErrors) {
      shouldScrollToErrorsRef.current = true;
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({ parts: {} });

    const resolved = resolveCoveragePayload(coveragePlan, selectableMonths);
    const planFields: Record<string, string> = {};

    if (resolved.isInstallment) {
      planFields.is_installment = "true";
      if (resolved.installmentPercent) {
        planFields.installment_percent = resolved.installmentPercent;
      }
      if (resolved.installmentThroughMonth) {
        planFields.installment_through_month = JSON.stringify(
          resolved.installmentThroughMonth,
        );
      }
    }

    const issuedBounds = getCalendarMonthUtcFilterBounds(resolved.issuedAnchor);
    planFields.issued_at = issuedBounds.start.toISOString();
    if (resolved.coveredMonths && resolved.coveredMonths.length > 0) {
      planFields.covered_months = JSON.stringify(resolved.coveredMonths);
    }

    planFields.billing_start_date = issuedBounds.start.toISOString();
    planFields.billing_end_date = issuedBounds.end.toISOString();
    if (user?.id) {
      planFields.created_by = String(user.id);
    }

    const submitParts = parts.map((part) => {
      const file = getLocalFile(part);
      const amount = Number.parseFloat(part.parsedAmount);
      const ymd = formatInTimeZone(part.paymentDate, tenantTimezone, "yyyy-MM-dd");
      return {
        ...(file ? { file } : {}),
        parsedAmount: String(amount),
        paymentMethodId: part.paymentMethodId.trim(),
        transactionId: part.transactionId.trim() || undefined,
        dateOnScreenshot: part.dateOnScreenshot.trim() || undefined,
        paymentDateIso: getTenantDayBoundariesIso(tenantTimezone, ymd).startIso,
        description: part.description.trim() || undefined,
        remarks: part.remarks.trim() || undefined,
        ocrEventId: part.ocrEventId,
      };
    });

    const fd = buildMultiPartPaymentFormData({
      userId: Number(userId),
      courseId: Number(courseId),
      planFields,
      parts: submitParts,
    });
    if (courseHasPaymentPlan && enrollmentQuery.data?.id) {
      appendDiscountSelectionToFormData(fd, discountSelection);
    }
    submitMutation.mutate(fd);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-3 py-6">
      <Link
        href={listHref}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <NavArrowLeft className="size-4" aria-hidden />
        Student payments
      </Link>

      <PageHeader
        title="Upload payment"
        description="Add one or more screenshots for a student payment."
        actions={
          userId ? (
            <Link
              href={`/finances/student-payments/enrollment-payment?userId=${userId}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Paying for several courses?
            </Link>
          ) : undefined
        }
      />

      {invalidContext ? (
        <p className="text-sm text-danger" role="alert">
          Missing course or student. Use Upload from the student payments table.
        </p>
      ) : null}

      <div
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
        aria-busy={isSaving}
      >
        <div
          className={cn(
            "space-y-4",
            isSaving && "pointer-events-none opacity-60",
          )}
        >
          <section
            className="space-y-4"
            aria-labelledby="upload-billing-period-heading"
          >
            <h2
              id="upload-billing-period-heading"
              className="text-sm font-medium text-foreground"
            >
              Billing period
            </h2>

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-text-muted">Remaining amount</p>
              <div className="flex min-h-7 items-baseline">
                {remainingAmountLoading ? (
                  <Skeleton className="h-7 w-32" aria-busy="true" />
                ) : remainingAmount != null ? (
                  <p className="font-mono text-lg font-medium tracking-tight text-foreground">
                    {formatMoney(remainingAmount, currencySymbol)}
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">—</p>
                )}
              </div>
            </div>

            {discountSectionView === "loading" ? (
              <PaymentDiscountPickerSkeleton />
            ) : discountSectionView === "error" ? (
              <p className="text-sm text-danger" role="alert">
                Could not load enrollment for discounts.
              </p>
            ) : discountSectionView === "not_enrolled" ? (
              <p className="text-sm text-text-muted" role="status">
                This student is not enrolled in this course. Discounts cannot be
                applied until they are enrolled.
              </p>
            ) : discountSectionView === "picker" && enrollmentId != null ? (
              <PaymentDiscountPicker
                userCourseId={enrollmentId}
                asOf={monthDate.toISOString().slice(0, 10)}
                value={discountSelection}
                onChange={setDiscountSelection}
                disabled={isSaving}
              />
            ) : null}

            <CoverageFields
              plan={coveragePlan}
              onChange={(next) => {
                setCoveragePlan(next);
                clearPlanFieldError();
                if (next.mode === DefaultStudentPaymentPlan.single_month) {
                  setDate(next.monthDate);
                }
              }}
              selectableMonths={selectableMonths}
              courseStartDate={courseQuery.data?.start_date}
              scheduleLoading={courseQuery.isLoading}
              scheduleError={courseQuery.isError}
              disabled={isSaving}
              planError={fieldErrors.plan}
              idPrefix="upload"
            />
          </section>
        </div>

        <form
            onSubmit={onSubmit}
            className="space-y-4"
          >
            <section className="space-y-4">
              {parts.map((part, index) => {
                const isPartOcrLoading = part.ocrStatus === "loading";
                const showPartChrome = parts.length > 1;
                const partErrors = fieldErrors.parts[part.key] ?? {};
                return (
                  <section
                    key={part.key}
                    className={cn(
                      uploadPartSectionClassName(),
                      index > 0 && "border-t border-border pt-4",
                    )}
                    {...(showPartChrome
                      ? {
                          "aria-labelledby": `upload-part-${part.key}-title`,
                        }
                      : {})}
                    aria-busy={isPartOcrLoading || undefined}
                  >
                    {showPartChrome ? (
                      <div className="flex items-center justify-between gap-3">
                        <h2
                          id={`upload-part-${part.key}-title`}
                          className="text-sm font-medium"
                        >
                          Part {index + 1}
                        </h2>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSaving}
                          onClick={() => removePart(part.key)}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null}

                    <div className={uploadPartScreenshotStackClassName()}>
                      {parts.length === 1 ? (
                        <SkipScreenshotCheckbox
                          id="upload-skip-screenshot"
                          checked={skipScreenshotUpload}
                          disabled={isSaving}
                          onCheckedChange={(checked) => {
                            setSkipScreenshotUpload(checked);
                            if (checked) {
                              ocrRequestIdsRef.current[part.key] =
                                (ocrRequestIdsRef.current[part.key] ?? 0) + 1;
                              setParts((prev) =>
                                prev.map((p) =>
                                  p.key === part.key
                                    ? {
                                        ...p,
                                        files: [],
                                        ocrStatus: "idle",
                                        ocrError: undefined,
                                        duplicateWarningId: null,
                                      }
                                    : p,
                                ),
                              );
                              clearPartFieldError(part.key, "screenshot");
                            }
                          }}
                        />
                      ) : null}

                      <Field.Root
                        className={uploadPartFieldRootClassName()}
                        name={uploadPartFieldDataName(part.key, "screenshot")}
                        invalid={Boolean(partErrors.screenshot)}
                        data-field-name={uploadPartFieldDataName(
                          part.key,
                          "screenshot",
                        )}
                      >
                        <Field.Label>Screenshot</Field.Label>
                        <div className="w-full self-stretch">
                          <FileDragAndDrop
                            className="w-full min-w-0"
                            label=""
                            labelClassName="sr-only"
                            files={part.files}
                            setFiles={(nextFiles) =>
                              setPartFiles(part.key, nextFiles)
                            }
                            maxFiles={1}
                            showCarousel={false}
                            showSelectedFiles={false}
                            showSelectionCount={false}
                            isReadOnly={isSaving || skipScreenshotUpload}
                            isButtonDisabled={isSaving || skipScreenshotUpload}
                            density="compact"
                          />
                        </div>
                        <UploadFieldError message={partErrors.screenshot} />
                      </Field.Root>

                      <PaymentScreenshotPreview
                        file={part.files[0]}
                        onView={setViewImageUrl}
                        onClear={() => clearScreenshotPart(part.key)}
                        clearDisabled={isSaving || isPartOcrLoading}
                      />

                      {isPartOcrLoading ? (
                        <p className="text-sm text-text-muted">
                          Reading screenshot...
                        </p>
                      ) : part.ocrStatus === "error" ? (
                        <p className="text-sm text-text-muted" role="status">
                          {part.ocrError ?? OCR_READ_ERROR_MESSAGE}
                        </p>
                      ) : null}

                      {part.duplicateWarningId ? (
                        <p
                          className="text-sm text-warning-foreground"
                          role="status"
                        >
                          This transaction may already be saved as payment #
                          {part.duplicateWarningId}.
                        </p>
                      ) : null}
                    </div>

                    <Field.Root
                      className={uploadPartFieldRootClassName()}
                      name={uploadPartFieldDataName(part.key, "paymentDate")}
                      data-field-name={uploadPartFieldDataName(
                        part.key,
                        "paymentDate",
                      )}
                    >
                      <Field.Label>Payment date</Field.Label>
                      <DatePicker
                        date={part.paymentDate}
                        setDate={(next) => {
                          if (next) updatePart(part.key, "paymentDate", next);
                        }}
                        disabled={isSaving}
                      />
                    </Field.Root>

                    <Field.Root
                      className={uploadPartFieldRootClassName()}
                      name={uploadPartFieldDataName(part.key, "paymentMethodId")}
                      invalid={Boolean(partErrors.paymentMethodId)}
                      data-field-name={uploadPartFieldDataName(
                        part.key,
                        "paymentMethodId",
                      )}
                    >
                      <Field.Label>Payment method</Field.Label>
                      <EntityCombobox
                        queryParams={{
                          fields: ["name", "id", "is_retired"],
                          sorts: ["name"],
                        }}
                        label="Payment method"
                        hideLabel
                        containerClassName="w-full min-w-0"
                        displayFunction={(e) => formatPaymentMethodDisplayName(e)}
                        entity="payment-methods"
                        value={part.paymentMethodId || undefined}
                        onChange={(v) =>
                          updatePart(part.key, "paymentMethodId", v ?? "")
                        }
                        loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
                        loadingPlaceholderActive={isPartOcrLoading}
                        disabled={isSaving || isPartOcrLoading}
                      />
                      <UploadFieldError message={partErrors.paymentMethodId} />
                    </Field.Root>

                    <Field.Root
                      className={uploadPartFieldRootClassName()}
                      name={uploadPartFieldDataName(part.key, "transactionId")}
                      invalid={Boolean(partErrors.transactionId)}
                      data-field-name={uploadPartFieldDataName(
                        part.key,
                        "transactionId",
                      )}
                    >
                      <Field.Label>Transaction ID</Field.Label>
                      <Input
                        placeholder="Optional"
                        loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
                        loadingPlaceholderActive={isPartOcrLoading}
                        value={part.transactionId}
                        disabled={isSaving || isPartOcrLoading}
                        onChange={(e) =>
                          updatePart(part.key, "transactionId", e.target.value)
                        }
                        className="h-9 w-full min-w-0"
                      />
                      <UploadFieldError message={partErrors.transactionId} />
                    </Field.Root>

                    <Field.Root
                      className={uploadPartFieldRootClassName()}
                      name={uploadPartFieldDataName(part.key, "parsedAmount")}
                      invalid={Boolean(partErrors.parsedAmount)}
                      data-field-name={uploadPartFieldDataName(
                        part.key,
                        "parsedAmount",
                      )}
                    >
                      <Field.Label>
                        Amount
                        {coveragePlan.mode === DefaultStudentPaymentPlan.installment ? (
                          <span className="ml-2 inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-xs font-normal text-text-secondary">
                            Installment
                          </span>
                        ) : null}
                      </Field.Label>
                      <div className="relative w-full">
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="Required"
                          loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
                          loadingPlaceholderActive={isPartOcrLoading}
                          value={part.parsedAmount}
                          disabled={isSaving || isPartOcrLoading}
                          onChange={(e) =>
                            updatePart(
                              part.key,
                              "parsedAmount",
                              e.target.value,
                            )
                          }
                          className="h-9 w-full min-w-0 pr-14"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                          {currencySymbol}
                        </span>
                      </div>
                      <UploadFieldError message={partErrors.parsedAmount} />
                    </Field.Root>

                    <Field.Root
                      className={uploadPartFieldRootClassName()}
                      name={`date-on-screenshot-${part.key}`}
                      data-field-name={`date-on-screenshot-${part.key}`}
                    >
                      <Field.Label>Date on screenshot</Field.Label>
                      <Input
                        placeholder="Optional"
                        value={part.dateOnScreenshot}
                        disabled={isSaving || isPartOcrLoading}
                        onChange={(e) =>
                          updatePart(
                            part.key,
                            "dateOnScreenshot",
                            e.target.value,
                          )
                        }
                        className="h-9 w-full min-w-0"
                      />
                    </Field.Root>

                    <Field.Root
                      className={uploadPartFieldRootClassName()}
                      name={`description-${part.key}`}
                      data-field-name={`description-${part.key}`}
                    >
                      <Field.Label>Description</Field.Label>
                      <Input
                        placeholder="Optional"
                        value={part.description}
                        disabled={isSaving}
                        onChange={(e) =>
                          updatePart(part.key, "description", e.target.value)
                        }
                        className="h-9 w-full min-w-0"
                      />
                    </Field.Root>

                    <Field.Root
                      className={uploadPartFieldRootClassName()}
                      name={`remarks-${part.key}`}
                      data-field-name={`remarks-${part.key}`}
                    >
                      <Field.Label>Remarks</Field.Label>
                      <Input
                        placeholder="Optional"
                        value={part.remarks}
                        disabled={isSaving}
                        onChange={(e) =>
                          updatePart(part.key, "remarks", e.target.value)
                        }
                        className="h-9 w-full min-w-0"
                      />
                    </Field.Root>
                  </section>
                );
              })}

              <div className="flex flex-wrap items-center justify-between gap-3">
                {parts.length > 1 ? (
                  <p className="text-sm font-medium">
                    Total: {formatMoney(totalAmount, currencySymbol)}
                  </p>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSaving || skipScreenshotUpload}
                  onClick={addPart}
                >
                  Add another screenshot
                </Button>
              </div>
            </section>

            {fieldErrors.form ? (
              <p
                className="text-sm text-danger"
                role="alert"
                data-field-name="upload-form-error"
              >
                {fieldErrors.form}
              </p>
            ) : null}
            <div className={uploadFormActionsClassName()}>
              <Button
                type="submit"
                disabled={
                  invalidContext || submitMutation.isPending || hasOcrLoading
                }
                isLoading={submitMutation.isPending}
              >
                Save payment
              </Button>
            </div>
          </form>
      </div>

      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Screenshot"
        onClose={() => setViewImageUrl(null)}
      />
    </div>
  );
};

export default function StudentPaymentUploadPage() {
  return (
    <PageContainer width="narrow">
      <Suspense>
        <StudentPaymentUploadPageInner />
      </Suspense>
    </PageContainer>
  );
}
