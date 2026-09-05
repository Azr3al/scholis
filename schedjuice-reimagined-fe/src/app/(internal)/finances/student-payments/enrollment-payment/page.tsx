"use client";

import { makePostRequest } from "@/app/client-api/utils";
import { DatePicker } from "@/components/date/date-picker";
import EntityCombobox from "@/components/form/entity-combobox";
import FileDragAndDrop, {
  type extendedFileType,
} from "@/components/form/file-drag-and-drop";
import { SkipScreenshotCheckbox } from "@/components/finances/payment-upload/skip-screenshot-checkbox";
import { useScreenshotPartOcr } from "@/components/finances/payment-upload/use-screenshot-part-ocr";
import { PaymentScreenshotPreview } from "@/components/finances/payment-screenshot-preview";
import { OCR_FIELD_EXTRACTING_MESSAGE } from "@/lib/finances/ocr-payment-screenshot";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import { getCalendarMonthUtcFilterBounds } from "@/helpers/date";
import {
  resolveCoveragePayload,
  selectableMonthsFromCourseDates,
  validateCoveragePlan,
} from "@/lib/finances/payment-coverage-plan";
import { UploadFieldError } from "@/components/finances/upload-field-error";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/misc/collapsible";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Checkbox, Field, Input, useToast } from "@/components/primitives";
import { formatMoney } from "@/helpers/money";
import { cn } from "@/lib/utils";
import { getTenantDayBoundariesIso, getTenantTodayYmd } from "@/helpers/shortcuts-time";
import { formatInTimeZone } from "date-fns-tz";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import {
  autoAllocate,
  checkAllocationBalance,
  allocationEntryKey,
  type AllocationEntry,
} from "@/lib/finances/payment-allocation";
import { buildMultiCoursePaymentFormData } from "@/lib/finances/payment-group-utils";
import {
  uploadFormActionsClassName,
  uploadPartFieldDataName,
  uploadPartFieldRootClassName,
  uploadPartScreenshotStackClassName,
} from "@/lib/finances/upload-form-layout";
import {
  getFirstUploadErrorFieldName,
  scrollToFirstUploadError,
  UPLOAD_PART_ERROR_MESSAGES,
  validateUploadParts,
  type PartFieldKey,
  type UploadFieldErrors,
} from "@/lib/finances/upload-part-validation";
import { useMutation } from "@tanstack/react-query";
import { NavArrowDown, NavArrowLeft } from "iconoir-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createStudentEntry,
  StudentPaymentEntrySection,
  type StudentEntry,
} from "./student-entry-section";

type ScreenshotDraft = {
  key: string;
  files: extendedFileType[];
  parsedAmount: string;
  paymentMethodId: string;
  transactionId: string;
  dateOnScreenshot: string;
  paymentDate: Date;
  description: string;
  remarks: string;
};

function formatDiscountLineEntry(
  label: string,
  amount: number,
  currencySymbol: string,
): string {
  return `${label} (-${formatMoney(amount, currencySymbol)})`;
}

function createScreenshotKey() {
  return `screenshot-${crypto.randomUUID()}`;
}

function createScreenshotDraft(defaultPaymentDate: Date): ScreenshotDraft {
  return {
    key: createScreenshotKey(),
    files: [],
    parsedAmount: "",
    paymentMethodId: "",
    transactionId: "",
    dateOnScreenshot: "",
    paymentDate: defaultPaymentDate,
    description: "",
    remarks: "",
  };
}

function EnrollmentPaymentPageInner() {
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

  const [queryUserId] = useQueryState("userId", parseAsString.withDefault(""));
  const billingAsOf = getTenantTodayYmd(tenantTimezone);
  const [defaultBillingMonth, setDefaultBillingMonth] = useState(() => {
    const [y, m] = billingAsOf.split("-").map(Number);
    return new Date(y, m - 1, 1);
  });
  const [studentEntries, setStudentEntries] = useState<StudentEntry[]>(() => [
    createStudentEntry(queryUserId ?? ""),
  ]);
  const [screenshots, setScreenshots] = useState<ScreenshotDraft[]>(() => [
    createScreenshotDraft(tenantToday),
  ]);
  const [skipScreenshotUpload, setSkipScreenshotUpload] = useState(false);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<AllocationEntry[]>([]);
  const [allocationsTouched, setAllocationsTouched] = useState(false);
  const [autoEnrollEnabled, setAutoEnrollEnabled] = useState(true);
  const [expandedAllocationRows, setExpandedAllocationRows] = useState<Set<string>>(
    () => new Set(),
  );
  const [fieldErrors, setFieldErrors] = useState<UploadFieldErrors>({
    parts: {},
  });
  const shouldScrollToErrorsRef = useRef(false);
  const ocr = useScreenshotPartOcr();

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

  useEffect(() => {
    if (!shouldScrollToErrorsRef.current) return;
    const fieldName = getFirstUploadErrorFieldName(
      fieldErrors,
      screenshots.map((s) => s.key),
    );
    if (!fieldName) return;
    shouldScrollToErrorsRef.current = false;
    scrollToFirstUploadError(fieldName);
  }, [fieldErrors, screenshots]);

  const updateStudentEntry = useCallback((key: string, patch: Partial<StudentEntry>) => {
    setStudentEntries((prev) =>
      prev.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
    );
  }, []);

  const markCoursesChanged = useCallback(() => {
    setAllocationsTouched(false);
  }, []);

  useEffect(() => {
    if (!queryUserId) return;
    setStudentEntries((prev) => {
      if (prev.length === 0) return [createStudentEntry(queryUserId)];
      if (prev[0].userId === queryUserId) return prev;
      return [{ ...prev[0], userId: queryUserId }, ...prev.slice(1)];
    });
  }, [queryUserId]);

  const allocationRows = useMemo(
    () =>
      studentEntries.flatMap((entry, studentIndex) =>
        entry.courses
          .filter(() => isValidApiEntityIdParam(entry.userId))
          .map((course) => ({
            rowKey: `${entry.key}-${course.courseId}`,
            entryKey: entry.key,
            userId: Number(entry.userId),
            studentIndex,
            course,
          })),
      ),
    [studentEntries],
  );

  const totalCourseRows = allocationRows.length;
  const isMultiStudent =
    new Set(
      studentEntries.map((entry) => entry.userId.trim()).filter(Boolean),
    ).size > 1;

  const isEnrollingAny = studentEntries.some(
    (entry) => entry.enrollingCourseIds.size > 0,
  );

  const screenshotsForAllocation = useMemo(
    () =>
      screenshots.map((s) => ({
        key: s.key,
        amount:
          s.parsedAmount.trim() === "" ? null : Number(s.parsedAmount),
      })),
    [screenshots],
  );

  const coursesForAllocation = useMemo(
    () =>
      allocationRows.map((row) => ({
        userId: row.userId,
        courseId: row.course.courseId,
        title: row.course.title,
        invoicedAmount: row.course.invoicedAmount,
      })),
    [allocationRows],
  );

  const screenshotSignature = JSON.stringify(screenshotsForAllocation);
  const courseSignature = JSON.stringify(coursesForAllocation);

  useEffect(() => {
    if (allocationsTouched) return;
    setAllocations(autoAllocate(screenshotsForAllocation, coursesForAllocation));
  }, [
    allocationsTouched,
    screenshotSignature,
    courseSignature,
    screenshotsForAllocation,
    coursesForAllocation,
  ]);

  const balance = useMemo(
    () => checkAllocationBalance(screenshotsForAllocation, allocations),
    [screenshotsForAllocation, allocations],
  );

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
      router.push("/finances/student-payments");
    },
    onError: () => {
      toast.add({ description: "Could not save payment." });
    },
  });

  const handleScreenshotFiles = async (
    screenshotKey: string,
    files: extendedFileType[],
  ) => {
    const localFile =
      files[0] && "file" in files[0] ? files[0].file : null;
    const isNewUpload = Boolean(localFile);
    const isClearing = files.length === 0;
    const resetOcrFields = isNewUpload || isClearing;
    if (localFile) {
      setSkipScreenshotUpload(false);
    }
    if (isClearing) {
      ocr.reset(screenshotKey);
    }
    setScreenshots((prev) =>
      prev.map((s) =>
        s.key === screenshotKey
          ? {
              ...s,
              files,
              parsedAmount: resetOcrFields ? "" : s.parsedAmount,
              transactionId: resetOcrFields ? "" : s.transactionId,
              dateOnScreenshot: resetOcrFields ? "" : s.dateOnScreenshot,
              paymentMethodId: resetOcrFields ? "" : s.paymentMethodId,
            }
          : s,
      ),
    );
    if (isClearing) {
      clearPartFieldError(screenshotKey, "screenshot");
      clearPartFieldError(screenshotKey, "parsedAmount");
      clearPartFieldError(screenshotKey, "transactionId");
      clearPartFieldError(screenshotKey, "paymentMethodId");
      return;
    }
    if (localFile) {
      clearPartFieldError(screenshotKey, "screenshot");
      clearPartFieldError(screenshotKey, "paymentMethodId");
    }
    if (localFile) {
      const result = await ocr.runOcr(screenshotKey, localFile);
      if (result) {
        setScreenshots((prev) =>
          prev.map((s) =>
            s.key === screenshotKey
              ? {
                  ...s,
                  transactionId: result.transactionId,
                  parsedAmount: result.parsedAmount,
                  dateOnScreenshot: result.dateOnScreenshot,
                  paymentMethodId: result.suggestedPaymentMethodId,
                }
              : s,
          ),
        );
        clearPartFieldError(screenshotKey, "parsedAmount");
        clearPartFieldError(screenshotKey, "transactionId");
        if (result.suggestedPaymentMethodId) {
          clearPartFieldError(screenshotKey, "paymentMethodId");
        }
      }
    }
  };

  const clearScreenshotPart = (screenshotKey: string) => {
    void handleScreenshotFiles(screenshotKey, []);
  };

  const handleSubmit = () => {
    const firstStudentId = studentEntries[0]?.userId ?? "";
    if (
      !firstStudentId.trim() ||
      totalCourseRows === 0 ||
      screenshots.length === 0
    ) {
      return;
    }

    const partValidation = validateUploadParts(
      screenshots.map((s) => ({
        key: s.key,
        hasFile: Boolean(s.files[0] && "file" in s.files[0]),
        skipScreenshot: skipScreenshotUpload && screenshots.length === 1,
        parsedAmount: s.parsedAmount,
        paymentMethodId: s.paymentMethodId,
        transactionId: s.transactionId,
      })),
      isValidApiEntityIdParam,
    );

    if (ocr.hasLoading) {
      shouldScrollToErrorsRef.current = true;
      setFieldErrors({
        parts: partValidation,
        form: UPLOAD_PART_ERROR_MESSAGES.formOcrLoading,
      });
      return;
    }

    if (Object.keys(partValidation).length > 0) {
      shouldScrollToErrorsRef.current = true;
      setFieldErrors({ parts: partValidation });
      return;
    }

    setFieldErrors({ parts: {} });

    let coverageInvalid = false;
    const nextEntries = studentEntries.map((entry) => {
      const coursesWithCoverageErrors = entry.courses.map((course) => {
        const selectable = selectableMonthsFromCourseDates(
          course.startDate,
          course.endDate,
        );
        const coverageError = validateCoveragePlan(course.coverage, selectable);
        if (coverageError) coverageInvalid = true;
        return { ...course, coverageError };
      });
      return { ...entry, courses: coursesWithCoverageErrors };
    });
    if (coverageInvalid) {
      setStudentEntries(nextEntries);
      return;
    }

    const resolvedRows = allocationRows.map((row) => ({
      userId: row.userId,
      course: row.course,
      resolved: resolveCoveragePayload(
        row.course.coverage,
        selectableMonthsFromCourseDates(row.course.startDate, row.course.endDate),
        { furthestCoveredKey: row.course.furthestCoveredKey },
      ),
    }));

    const earliestIssued = resolvedRows.reduce<Date | null>((min, row) => {
      if (min == null || row.resolved.issuedAnchor < min) {
        return row.resolved.issuedAnchor;
      }
      return min;
    }, null);
    const issuedBounds = getCalendarMonthUtcFilterBounds(
      earliestIssued ?? defaultBillingMonth,
    );
    const planFields: Record<string, string> = {
      issued_at: issuedBounds.start.toISOString(),
      billing_start_date: issuedBounds.start.toISOString(),
    };
    if (user?.id) planFields.created_by = String(user.id);

    const screenshotIndexByKey = new Map(
      screenshots.map((s, index) => [s.key, index]),
    );

    const fd = buildMultiCoursePaymentFormData({
      userId: Number(firstStudentId),
      planFields,
      courses: resolvedRows.map(({ userId, course, resolved }) => ({
        courseId: course.courseId,
        userId: isMultiStudent ? userId : undefined,
        discountIds: course.discountSelection.discountIds,
        clearDiscount: course.discountSelection.discountIds.length === 0,
        autoEnroll: autoEnrollEnabled,
        coveredMonths: resolved.coveredMonths ?? undefined,
        isInstallment: resolved.isInstallment,
        installmentPercent: resolved.installmentPercent,
        installmentThroughMonth: resolved.installmentThroughMonth,
      })),
      screenshots: screenshots.map((s) => {
        const file = s.files[0] && "file" in s.files[0] ? s.files[0].file : null;
        const ymdPart = formatInTimeZone(
          s.paymentDate,
          tenantTimezone,
          "yyyy-MM-dd",
        );
        return {
          ...(file ? { file } : {}),
          parsedAmount: s.parsedAmount,
          paymentMethodId: s.paymentMethodId,
          transactionId: s.transactionId || undefined,
          dateOnScreenshot: s.dateOnScreenshot || undefined,
          paymentDateIso: getTenantDayBoundariesIso(tenantTimezone, ymdPart)
            .startIso,
          description: s.description || undefined,
          remarks: s.remarks || undefined,
        };
      }),
      allocations: allocations.map((entry) => ({
        screenshotIndex: screenshotIndexByKey.get(entry.screenshotKey) ?? 0,
        courseId: entry.courseId,
        userId: isMultiStudent ? entry.userId : undefined,
        amount: entry.amount,
      })),
    });

    submitMutation.mutate(fd);
  };

  const allCoursesEnrolled = allocationRows.every(
    (row) => row.course.enrollmentId != null,
  );
  const allStudentsValid = studentEntries.every(
    (entry) =>
      entry.courses.length === 0 ||
      (entry.userId.trim() && isValidApiEntityIdParam(entry.userId)),
  );

  const canSubmit =
    allStudentsValid &&
    totalCourseRows >= 1 &&
    screenshots.length > 0 &&
    balance.isBalanced &&
    !ocr.hasLoading &&
    !submitMutation.isPending &&
    !isEnrollingAny &&
    allCoursesEnrolled;

  const handleResetAllocations = useCallback(() => {
    setAllocationsTouched(false);
    setAllocations(autoAllocate(screenshotsForAllocation, coursesForAllocation));
  }, [coursesForAllocation, screenshotsForAllocation]);

  const transactionSummary = useMemo(() => {
    if (totalCourseRows < 1) return null;

    let subtotal = 0;
    let totalDue = 0;
    const discountByLabel = new Map<string, number>();

    for (const row of allocationRows) {
      const course = row.course;
      if (course.feeBreakdown) {
        subtotal += course.feeBreakdown.subtotal;
        totalDue += course.feeBreakdown.total;
        for (const line of course.feeBreakdown.discountLines) {
          discountByLabel.set(
            line.label,
            (discountByLabel.get(line.label) ?? 0) + line.amount,
          );
        }
        continue;
      }
      if (course.invoicedAmount == null) return null;
      totalDue += course.invoicedAmount;
      subtotal += course.planPrice ?? course.invoicedAmount;
    }

    const discountLines = Array.from(discountByLabel.entries()).map(
      ([label, amount]) => ({ label, amount }),
    );

    return { subtotal, discountLines, totalDue };
  }, [allocationRows, totalCourseRows]);

  const paymentReceived = useMemo(
    () =>
      screenshotsForAllocation.reduce((sum, s) => sum + (s.amount ?? 0), 0),
    [screenshotsForAllocation],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-3 py-6">
      <Link
        href="/finances/student-payments"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <NavArrowLeft className="size-4" aria-hidden />
        Student payments
      </Link>

      <PageHeader
        title="Enrollment payment"
        description="Record one transaction for one or more courses."
      />

      <div className="space-y-6 rounded-lg border border-border bg-surface p-4">
        <section className="space-y-4" aria-labelledby="enrollment-students-heading">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="enrollment-students-heading"
              className="text-sm font-medium text-foreground"
            >
              Students
            </h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setStudentEntries((prev) => [...prev, createStudentEntry()])
              }
            >
              Add student
            </Button>
          </div>

          <div className="space-y-4">
            {studentEntries.map((entry, index) => (
              <StudentPaymentEntrySection
                key={entry.key}
                entryKey={entry.key}
                entry={entry}
                index={index}
                canRemove={studentEntries.length > 1}
                defaultBillingMonth={defaultBillingMonth}
                currencySymbol={currencySymbol}
                autoEnrollEnabled={autoEnrollEnabled}
                onUpdateEntry={updateStudentEntry}
                onRemove={() => {
                  setStudentEntries((prev) =>
                    prev.filter((row) => row.key !== entry.key),
                  );
                  markCoursesChanged();
                }}
                onCoursesChanged={markCoursesChanged}
              />
            ))}
          </div>

          <YearMonthSelector
            date={defaultBillingMonth}
            setDate={setDefaultBillingMonth}
            label="Default billing month"
            fullWidth
          />

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              checked={autoEnrollEnabled}
              onCheckedChange={(checked) =>
                setAutoEnrollEnabled(checked === true)
              }
              className="mt-0.5"
            />
            <span className="text-text-secondary">
              Enroll students in courses they aren&apos;t in yet
            </span>
          </label>

          <p className="text-xs text-text-muted">
            {autoEnrollEnabled
              ? "Students will be enrolled automatically when needed."
              : "Only courses a student is already enrolled in can be selected."}
            {" "}
            Select at least one course. Add multiple students or courses when
            one payment covers more than a single enrollment.
          </p>
        </section>

        <section
          className="space-y-4 border-t border-border pt-4"
          aria-labelledby="enrollment-screenshots-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="enrollment-screenshots-heading"
              className="text-sm font-medium text-foreground"
            >
              Screenshots
            </h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={skipScreenshotUpload}
              onClick={() => {
                setSkipScreenshotUpload(false);
                setScreenshots((prev) => [
                  ...prev,
                  createScreenshotDraft(tenantToday),
                ]);
              }}
            >
              Add screenshot
            </Button>
          </div>
          {screenshots.map((screenshot, index) => {
            const partErrors = fieldErrors.parts[screenshot.key] ?? {};
            const isScreenshotOcrLoading =
              ocr.stateByKey[screenshot.key]?.status === "loading";
            return (
            <div
              key={screenshot.key}
              className="space-y-3 rounded-md border border-border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">Screenshot {index + 1}</p>
                {screenshots.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-danger hover:bg-danger/10 hover:text-danger"
                    onClick={() => {
                      ocr.reset(screenshot.key);
                      setScreenshots((prev) =>
                        prev.filter((s) => s.key !== screenshot.key),
                      );
                    }}
                  >
                    Remove screenshot
                  </Button>
                ) : null}
              </div>
              <div className={uploadPartScreenshotStackClassName()}>
                {screenshots.length === 1 ? (
                  <SkipScreenshotCheckbox
                    id="enrollment-skip-screenshot"
                    checked={skipScreenshotUpload}
                    disabled={submitMutation.isPending}
                    onCheckedChange={(checked) => {
                      setSkipScreenshotUpload(checked);
                      if (checked) {
                        ocr.reset(screenshot.key);
                        setScreenshots((prev) =>
                          prev.map((s) =>
                            s.key === screenshot.key ? { ...s, files: [] } : s,
                          ),
                        );
                        clearPartFieldError(screenshot.key, "screenshot");
                      }
                    }}
                  />
                ) : null}

                <Field.Root
                  className={uploadPartFieldRootClassName()}
                  name={uploadPartFieldDataName(screenshot.key, "screenshot")}
                  invalid={Boolean(partErrors.screenshot)}
                  data-field-name={uploadPartFieldDataName(
                    screenshot.key,
                    "screenshot",
                  )}
                >
                  <Field.Label>Screenshot</Field.Label>
                  <div className="w-full self-stretch">
                    <FileDragAndDrop
                      className="w-full min-w-0"
                      label=""
                      labelClassName="sr-only"
                      maxFiles={1}
                      files={screenshot.files}
                      isReadOnly={skipScreenshotUpload}
                      isButtonDisabled={skipScreenshotUpload}
                      setFiles={(files) =>
                        void handleScreenshotFiles(screenshot.key, files)
                      }
                      showCarousel={false}
                      showSelectedFiles={false}
                      showSelectionCount={false}
                      density="compact"
                    />
                  </div>
                  <UploadFieldError message={partErrors.screenshot} />
                </Field.Root>
                <PaymentScreenshotPreview
                  file={screenshot.files[0]}
                  onView={setViewImageUrl}
                  onClear={() => clearScreenshotPart(screenshot.key)}
                  clearDisabled={
                    submitMutation.isPending || isScreenshotOcrLoading
                  }
                />
              </div>
              <Field.Root
                className={uploadPartFieldRootClassName()}
                name={uploadPartFieldDataName(screenshot.key, "parsedAmount")}
                invalid={Boolean(partErrors.parsedAmount)}
                data-field-name={uploadPartFieldDataName(
                  screenshot.key,
                  "parsedAmount",
                )}
              >
                <Field.Label>Amount</Field.Label>
                <Input
                  type="number"
                  value={screenshot.parsedAmount}
                  onChange={(e) => {
                    setAllocationsTouched(false);
                    clearPartFieldError(screenshot.key, "parsedAmount");
                    setScreenshots((prev) =>
                      prev.map((s) =>
                        s.key === screenshot.key
                          ? { ...s, parsedAmount: e.target.value }
                          : s,
                      ),
                    );
                  }}
                  placeholder={
                    isScreenshotOcrLoading
                      ? OCR_FIELD_EXTRACTING_MESSAGE
                      : undefined
                  }
                  disabled={isScreenshotOcrLoading}
                />
                <UploadFieldError message={partErrors.parsedAmount} />
              </Field.Root>
              <Field.Root
                className={uploadPartFieldRootClassName()}
                name={uploadPartFieldDataName(screenshot.key, "paymentMethodId")}
                invalid={Boolean(partErrors.paymentMethodId)}
                data-field-name={uploadPartFieldDataName(
                  screenshot.key,
                  "paymentMethodId",
                )}
              >
                <Field.Label>Payment method</Field.Label>
                <EntityCombobox
                  entity="payment-methods"
                  value={screenshot.paymentMethodId}
                  onChange={(v) => {
                    clearPartFieldError(screenshot.key, "paymentMethodId");
                    setScreenshots((prev) =>
                      prev.map((s) =>
                        s.key === screenshot.key
                          ? { ...s, paymentMethodId: v }
                          : s,
                      ),
                    );
                  }}
                  label="Payment method"
                  hideLabel
                  displayFunction={(m: { name?: string }) => m.name ?? "—"}
                  loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
                  loadingPlaceholderActive={isScreenshotOcrLoading}
                  disabled={isScreenshotOcrLoading}
                />
                <UploadFieldError message={partErrors.paymentMethodId} />
              </Field.Root>
              <Field.Root
                className={uploadPartFieldRootClassName()}
                name={uploadPartFieldDataName(screenshot.key, "transactionId")}
                invalid={Boolean(partErrors.transactionId)}
                data-field-name={uploadPartFieldDataName(
                  screenshot.key,
                  "transactionId",
                )}
              >
                <Field.Label>Transaction ID</Field.Label>
                <Input
                  loadingPlaceholder={OCR_FIELD_EXTRACTING_MESSAGE}
                  loadingPlaceholderActive={isScreenshotOcrLoading}
                  value={screenshot.transactionId}
                  disabled={isScreenshotOcrLoading}
                  onChange={(e) => {
                    clearPartFieldError(screenshot.key, "transactionId");
                    setScreenshots((prev) =>
                      prev.map((s) =>
                        s.key === screenshot.key
                          ? { ...s, transactionId: e.target.value }
                          : s,
                      ),
                    );
                  }}
                />
                <UploadFieldError message={partErrors.transactionId} />
              </Field.Root>
              <Field.Root className="w-full gap-1.5">
                <Field.Label>Payment date</Field.Label>
                <DatePicker
                  date={screenshot.paymentDate}
                  setDate={(d) =>
                    setScreenshots((prev) =>
                      prev.map((s) =>
                        s.key === screenshot.key
                          ? { ...s, paymentDate: d ?? tenantToday }
                          : s,
                      ),
                    )
                  }
                />
              </Field.Root>
            </div>
            );
          })}
        </section>

        <section
          className="space-y-4 border-t border-border pt-4"
          aria-labelledby="enrollment-allocation-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="enrollment-allocation-heading"
              className="text-sm font-medium text-foreground"
            >
              Allocation
            </h2>
            {totalCourseRows > 0 && screenshots.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleResetAllocations}
              >
                Reset to suggested
              </Button>
            ) : null}
          </div>

          {totalCourseRows >= 1 ? (
            transactionSummary ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-muted">Subtotal</span>
                  <span>{formatMoney(transactionSummary.subtotal, currencySymbol)}</span>
                </div>
                {transactionSummary.discountLines.map((line) => (
                  <div
                    key={line.label}
                    className="flex items-center justify-between gap-2 text-text-muted"
                  >
                    <span>{formatDiscountLineEntry(line.label, line.amount, currencySymbol)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 border-t border-border pt-2 font-medium">
                  <span>Total due</span>
                  <span>{formatMoney(transactionSummary.totalDue, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-text-muted">
                  <span>Payment received</span>
                  <span>{formatMoney(paymentReceived, currencySymbol)}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Pricing loading…</p>
            )
          ) : null}

          {balance.perScreenshot.map((row) => (
            <p
              key={row.key}
              className={
                row.isBalanced ? "text-sm text-text-muted" : "text-sm text-amber-800"
              }
            >
              Screenshot total: {row.allocated} / {row.expected ?? "—"}
            </p>
          ))}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-2">Course</th>
                  {screenshots.map((s, i) => (
                    <th key={s.key} className="py-2 pr-2">
                      Screenshot {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allocationRows.map((row) => {
                  const course = row.course;
                  const courseTotal =
                    course.feeBreakdown?.total ?? course.invoicedAmount;
                  const isExpanded = expandedAllocationRows.has(row.rowKey);
                  return (
                    <tr key={row.rowKey} className="border-b align-top">
                      <td className="py-2 pr-2">
                        {isMultiStudent ? (
                          <p className="mb-1 text-xs text-text-muted">
                            Student {row.studentIndex + 1}
                          </p>
                        ) : null}
                        <Collapsible
                          open={isExpanded}
                          onOpenChange={(open) => {
                            setExpandedAllocationRows((prev) => {
                              const next = new Set(prev);
                              if (open) next.add(row.rowKey);
                              else next.delete(row.rowKey);
                              return next;
                            });
                          }}
                        >
                          <CollapsibleTrigger
                            type="button"
                            className="flex w-full min-w-0 items-start justify-between gap-2 text-left"
                          >
                            <span className="min-w-0 font-medium">
                              {course.title}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              {courseTotal != null ? (
                                <span className="text-text-muted">
                                  {formatMoney(courseTotal, currencySymbol)}
                                </span>
                              ) : null}
                              <NavArrowDown
                                className={cn(
                                  "size-4 shrink-0 text-text-muted transition-transform",
                                  isExpanded && "rotate-180",
                                )}
                                aria-hidden
                              />
                            </span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 space-y-1 text-xs text-text-muted">
                            {course.feeBreakdown ? (
                              <>
                                <div className="flex justify-between gap-2">
                                  <span>Subtotal</span>
                                  <span>
                                    {formatMoney(
                                      course.feeBreakdown.subtotal,
                                      currencySymbol,
                                    )}
                                  </span>
                                </div>
                                {course.feeBreakdown.discountLines.map(
                                  (line) => (
                                    <div
                                      key={line.label}
                                      className="flex justify-between gap-2"
                                    >
                                      <span>
                                        {formatDiscountLineEntry(
                                          line.label,
                                          line.amount,
                                          currencySymbol,
                                        )}
                                      </span>
                                    </div>
                                  ),
                                )}
                                <div className="flex justify-between gap-2 font-medium text-foreground">
                                  <span>Course total</span>
                                  <span>
                                    {formatMoney(
                                      course.feeBreakdown.total,
                                      currencySymbol,
                                    )}
                                  </span>
                                </div>
                              </>
                            ) : courseTotal != null ? (
                              <div className="flex justify-between gap-2 font-medium text-foreground">
                                <span>Course total</span>
                                <span>
                                  {formatMoney(courseTotal, currencySymbol)}
                                </span>
                              </div>
                            ) : (
                              <p>Pricing loading…</p>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      </td>
                      {screenshots.map((screenshot) => {
                        const entry = allocations.find(
                          (a) =>
                            a.userId === row.userId &&
                            a.courseId === course.courseId &&
                            a.screenshotKey === screenshot.key,
                        );
                        return (
                          <td key={screenshot.key} className="py-2 pr-2">
                            <Input
                              type="number"
                              className="w-28"
                              value={entry?.amount ?? ""}
                              onChange={(e) => {
                                setAllocationsTouched(true);
                                const amount = Number(e.target.value);
                                const key = allocationEntryKey({
                                  screenshotKey: screenshot.key,
                                  userId: row.userId,
                                  courseId: course.courseId,
                                });
                                setAllocations((prev) => {
                                  const rest = prev.filter(
                                    (a) =>
                                      allocationEntryKey(a) !== key ||
                                      (amount > 0 &&
                                        allocationEntryKey(a) === key),
                                  );
                                  if (!Number.isFinite(amount) || amount <= 0) {
                                    return rest.filter(
                                      (a) => allocationEntryKey(a) !== key,
                                    );
                                  }
                                  const existing = prev.find(
                                    (a) => allocationEntryKey(a) === key,
                                  );
                                  if (existing) {
                                    return prev.map((a) =>
                                      allocationEntryKey(a) === key
                                        ? { ...a, amount }
                                        : a,
                                    );
                                  }
                                  return [
                                    ...rest,
                                    {
                                      screenshotKey: screenshot.key,
                                      userId: row.userId,
                                      courseId: course.courseId,
                                      amount,
                                    },
                                  ];
                                });
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className={uploadFormActionsClassName()}>
          {fieldErrors.form ? (
            <p
              className="w-full text-sm text-danger"
              role="alert"
              data-field-name="upload-form-error"
            >
              {fieldErrors.form}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitMutation.isPending || ocr.hasLoading}
            isLoading={submitMutation.isPending}
          >
            Save payment
          </Button>
        </div>
      </div>
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        onClose={() => setViewImageUrl(null)}
      />
    </div>
  );
}

export default function EnrollmentPaymentPage() {
  return (
    <Suspense fallback={null}>
      <EnrollmentPaymentPageInner />
    </Suspense>
  );
}
