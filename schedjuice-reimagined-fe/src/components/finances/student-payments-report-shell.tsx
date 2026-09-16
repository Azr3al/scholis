"use client";

import { Button, Input, buttonVariants } from "@/components/primitives";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";

import { GridViewToggle } from "@/components/finances/grid-view-toggle";
import { StudentPaymentsGrid } from "@/components/finances/student-payments-grid";
import {
  studentPaymentsReportShellClassName,
  StudentPaymentsReportHeader,
  StudentPaymentsSplitPane,
} from "@/components/finances/student-payments-report-shell-layout";
import { StudentPaymentsResourceTable } from "@/components/finances/student-payments-resource-table";
import { StudentPaymentsDrawer } from "@/components/finances/student-payments-drawer";
import { PaymentAdjustmentsDrawer } from "@/components/finances/payment-adjustments-drawer";
import { PaymentCoverageEditDialog } from "@/components/finances/payment-coverage-edit-dialog";
import { PaymentGridSummaryStrip } from "@/components/finances/payments-grid/payment-grid-summary-strip";
import { buildPaymentSummaryLine } from "@/components/finances/payments-grid/payment-grid-summary";
import { StudentPaymentsMonthNotApplicable } from "@/components/finances/student-payments-month-not-applicable";
import EntityCombobox from "@/components/form/entity-combobox";
import {
  FilterToolbar,
  FilterToolbarAction,
  FilterToolbarField,
} from "@/components/filters/filter-toolbar";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import Selector from "@/components/form/selectors/selector";
import { useGridViewPreference } from "@/hooks/use-grid-view-preference";
import { useFullscreen } from "@/hooks/use-fullscreen";
import {
  useStudentPaymentsAdminReport,
} from "@/hooks/finances/use-student-payments-admin-report";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { canRecordRefunds } from "@/helpers/authorization";
import { ReportSkeleton } from "@/components/loading/structured-skeletons";
import { getCourseMonthType } from "@/helpers/date";
import { getCourseOfUserFilterParams } from "@/helpers/course";
import { snakeToTitle } from "@/helpers/formatters";
import { shouldShowStudentPaymentsMonthSelector } from "@/lib/finances/student-payments-filter-ui";
import { PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS } from "@/lib/ui/select-layout";
import CopyInput from "@/components/misc/copy-input";
import { cn } from "@/lib/utils";
import { UserPaymentStatus } from "@/types/finance";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import type { StudentPaymentsReportProps } from "@/components/finances/student-payments-report";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

function getStudentPaymentsTableUid(
  fixedCourseId?: string,
  globalTransactionLookup?: boolean,
): string {
  if (globalTransactionLookup) return "student-payments-txn-lookup";
  return fixedCourseId ? `student-payments-course-${fixedCourseId}` : "student-payments";
}

export function StudentPaymentsReportShell({
  fixedCourseId,
  courseMeta,
  verificationUploadHref = "/finances/student-payments/verification-upload",
  globalTransactionLookup = false,
}: StudentPaymentsReportProps) {
  const { useGlideView, toggleView, hydrated: gridViewHydrated } =
    useGridViewPreference("student-payments");
  const { effectiveFullscreen } = useFullscreen();
  const { user } = useUser();
  const currencySymbol = useTenantCurrencySymbol();

  const tableUid = useMemo(
    () => getStudentPaymentsTableUid(fixedCourseId, globalTransactionLookup),
    [fixedCourseId, globalTransactionLookup],
  );

  const report = useStudentPaymentsAdminReport({
    fixedCourseId,
    courseMeta,
    globalTransactionLookup,
    tableUid,
  });

  const [studentId, setStudentId] = useState("");
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [coverageEdit, setCoverageEdit] = useState<null | {
    paymentIds: number[];
    courseStartDate?: string | null;
    courseEndDate?: string | null;
  }>(null);
  const [adjustmentsRow, setAdjustmentsRow] =
    useState<StudentPaymentAdminReportRow | null>(null);

  const openStudent = useCallback((uid: number) => {
    setStudentId(String(uid));
  }, []);
  const closeStudent = useCallback(() => setStudentId(""), []);

  const openCoverageEdit = useCallback((row: StudentPaymentAdminReportRow) => {
    if (typeof row.id !== "number") return;
    setCoverageEdit({
      paymentIds: [row.id],
      courseStartDate: row.course?.start_date ?? null,
      courseEndDate: row.course?.end_date ?? null,
    });
  }, []);

  const openAdjustments = useCallback((row: StudentPaymentAdminReportRow) => {
    if (typeof row.id !== "number") return;
    setAdjustmentsRow(row);
  }, []);
  const closeAdjustments = useCallback(() => setAdjustmentsRow(null), []);

  const canManageRefunds = Boolean(user && canRecordRefunds(user));

  const showMultiCoursePaymentLink =
    !globalTransactionLookup && !fixedCourseId;

  const headerActions = globalTransactionLookup ? undefined : (
    <>
      {showMultiCoursePaymentLink ? (
        <Link
          href="/finances/student-payments/enrollment-payment"
          className="text-sm font-medium text-primary hover:underline"
        >
          Paying for several courses?
        </Link>
      ) : null}
      <GridViewToggle useGlideView={useGlideView} onToggle={toggleView} />
      <Link
        href={verificationUploadHref}
        className={cn(buttonVariants({ variant: "primary" }))}
      >
        Upload Verification File
      </Link>
    </>
  );

  const studentDrawer = (
    <StudentPaymentsDrawer
      studentId={studentId}
      courseId={report.effectiveCourseId}
      monthDate={report.date}
      onClose={closeStudent}
      onViewScreenshot={(url) => setViewImageUrl(url)}
    />
  );

  const screenshotDialog = (
    <FullScreenImageViewer
      imageUrl={viewImageUrl}
      title="Screenshot"
      onClose={() => setViewImageUrl(null)}
    />
  );

  const coverageDialog = (
    <PaymentCoverageEditDialog
      open={coverageEdit !== null}
      onOpenChange={(open) => {
        if (!open) setCoverageEdit(null);
      }}
      paymentIds={coverageEdit?.paymentIds ?? []}
      courseStartDate={coverageEdit?.courseStartDate}
      courseEndDate={coverageEdit?.courseEndDate}
      onSaved={() => report.refetch()}
    />
  );

  const adjustmentsDrawer = (
    <PaymentAdjustmentsDrawer
      paymentRow={adjustmentsRow}
      tableUid={tableUid}
      onClose={closeAdjustments}
      onViewImage={(url) => setViewImageUrl(url)}
      canManage={canManageRefunds}
    />
  );

  if (!gridViewHydrated) {
    return <ReportSkeleton tableColumns={8} tableRows={8} />;
  }

  if (useGlideView) {
    const grid = (
      <StudentPaymentsGrid
        variant="report"
        fixedCourseId={fixedCourseId}
        courseMeta={courseMeta}
        globalTransactionLookup={globalTransactionLookup}
        report={report}
        onOpenStudent={openStudent}
        embedded
      />
    );

    if (effectiveFullscreen) {
      return (
        <>
          {grid}
          {studentDrawer}
          {screenshotDialog}
          {coverageDialog}
          {adjustmentsDrawer}
        </>
      );
    }

    return (
      <>
        <div className={studentPaymentsReportShellClassName()}>
          <StudentPaymentsReportHeader
            title="Student payments"
            summaryLine={buildPaymentSummaryLine(
              report.rows,
              report.apiSummary,
              currencySymbol,
              fixedCourseId,
              report.monthApplicable,
            )}
            actions={headerActions}
          />
          <StudentPaymentsSplitPane main={grid} />
        </div>
        {studentDrawer}
        {screenshotDialog}
        {coverageDialog}
        {adjustmentsDrawer}
      </>
    );
  }

  const summaryLine = buildPaymentSummaryLine(
    report.rows,
    report.apiSummary,
    currencySymbol,
    fixedCourseId,
    report.monthApplicable,
  );

  const monthTypeStartDate =
    report.selectedCourseEntity?.start_date ?? courseMeta?.start_date;
  const monthType = monthTypeStartDate
    ? getCourseMonthType(monthTypeStartDate)
    : null;

  const filterControls = (
    <div className="space-y-3">
      <FilterToolbar className="items-start gap-x-4 gap-y-3">
        <FilterToolbarField label="Transaction ID" width="md">
          <Input
            className="h-10 w-full"
            value={report.transactionId}
            onChange={(e) => report.setTransactionId(e.target.value)}
          />
        </FilterToolbarField>
        {shouldShowStudentPaymentsMonthSelector({
          globalTransactionLookup: Boolean(globalTransactionLookup),
        }) ? (
          <YearMonthSelector
            layout="toolbar"
            label="Month"
            date={report.monthDate}
            setDate={report.setDate}
            monthType={monthType}
          />
        ) : null}
        {user && !fixedCourseId && !globalTransactionLookup ? (
          <EntityCombobox
            filterParams={{
              filter_params: getCourseOfUserFilterParams(user).filter_params,
            }}
            queryParams={{
              fields: ["title", "id", "start_date", "end_date"],
              sorts: ["title"],
            }}
            displayFunction={(e) => e.title}
            entity="courses"
            value={report.courseIdFromUrl}
            onChange={(v) => {
              report.setCourseIdFromUrl(v);
              if (!v) report.setSelectedCourseEntity(null);
            }}
            onSelectedEntityChange={(entity) => {
              if (fixedCourseId) return;
              if (!entity) {
                report.setSelectedCourseEntity(null);
                return;
              }
              report.setSelectedCourseEntity({
                id: entity.id,
                title: entity.title,
                start_date: entity.start_date,
                end_date: entity.end_date,
              });
            }}
            label="Course"
            layout="toolbar"
            containerClassName="flex w-72 min-w-0 flex-col gap-1.5"
          />
        ) : null}
        <Selector
          options={Object.keys(UserPaymentStatus).map((o) => ({
            value: o,
            label: snakeToTitle(o),
          }))}
          value={report.status as UserPaymentStatus | undefined}
          onChange={(v) => report.setStatus(v)}
          label="Status"
          layout="toolbar"
          containerClassName={PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS}
        />
        <FilterToolbarAction>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="shrink-0 active:scale-[0.98]"
            onClick={() => report.clearFilters()}
          >
            Clear
          </Button>
        </FilterToolbarAction>
      </FilterToolbar>
      <CopyInput
        disabled
        className="w-full max-w-xl space-y-1.5"
        labelClassName="text-xs font-normal text-muted-foreground"
        text={typeof window !== "undefined" ? window.location.href : ""}
        label="Share link"
      />
    </div>
  );

  return (
    <>
      <div className={studentPaymentsReportShellClassName(false)}>
        <StudentPaymentsReportHeader
          summaryLine={summaryLine}
          actions={headerActions}
        />
        <div className="shrink-0 border-b border-border bg-muted/20">
          <div className="px-4 py-3">{filterControls}</div>
        </div>
        <PaymentGridSummaryStrip
          rows={report.rows}
          apiSummary={report.apiSummary}
          currencySymbol={currencySymbol}
          fixedCourseId={fixedCourseId}
          courseMeta={courseMeta}
          selectedCourse={report.selectedCourseEntity}
          coursePaymentPlan={report.coursePaymentPlan}
          monthAnchor={report.monthDate}
          variant="report"
          monthApplicable={report.monthApplicable}
        />
        <StudentPaymentsSplitPane
          bounded={false}
          main={
            report.monthApplicable ? (
              <StudentPaymentsResourceTable
                rows={report.rows}
                isLoading={report.showSkeleton}
                isError={report.isError}
                error={
                  report.isError ? new Error("Failed to load payments.") : null
                }
                refetch={report.refetch}
                hideCourseColumn={report.hideCourseColumn}
                monthDate={report.monthDate}
                onOpenStudent={openStudent}
                onViewScreenshot={(url) => setViewImageUrl(url)}
                onEditCoverage={openCoverageEdit}
                onOpenAdjustments={openAdjustments}
                tableUid={tableUid}
              />
            ) : (
              <StudentPaymentsMonthNotApplicable
                selectedMonth={report.monthDate}
                courseStartDate={
                  report.selectedCourseEntity?.start_date ?? courseMeta?.start_date
                }
                courseEndDate={
                  report.selectedCourseEntity?.end_date ?? courseMeta?.end_date
                }
                suggestedMonth={report.suggestedMonth}
                onGoToMonth={report.setDate}
              />
            )
          }
        />
      </div>
      {studentDrawer}
      {screenshotDialog}
      {coverageDialog}
      {adjustmentsDrawer}
    </>
  );
}
