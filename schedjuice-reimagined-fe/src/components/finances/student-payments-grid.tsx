"use client";
import { Button, Input, Skeleton, inputClassName, useToast } from "@/components/primitives";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { DatePicker } from "@/components/date/date-picker";

import "@glideapps/glide-data-grid/dist/index.css";

import { makePostRequest, searchEntities, updateEntity } from "@/app/client-api/utils";
import { PaymentCoverageEditDialog } from "@/components/finances/payment-coverage-edit-dialog";
import {
  PaymentBankFilterChips,
  PaymentBankMultiSelectFilter,
} from "@/components/finances/payment-bank-multi-select-filter";
import { PaymentAdjustmentsDrawer } from "@/components/finances/payment-adjustments-drawer";
import type {
  StudentPaymentAdminReportRow,
  StudentPaymentsCourseMeta,
  StudentPaymentsReportProps,
} from "@/components/finances/student-payments-report";
import { DataSheet } from "@/components/data-sheet/data-sheet";
import type { DataSheetColumnLayoutApi } from "@/components/data-sheet/data-sheet-impl";
import type { SheetCapabilities } from "@/components/data-sheet/types";
import { fontCellPaddingFor } from "@/components/data-sheet/types";
import { getActiveFontPx } from "@/components/data-sheet/lib/glide-theme";
import { FullscreenToggle } from "@/components/layout/fullscreen-toggle";
import {
  SheetFullscreenShell,
} from "@/components/layout/sheet-fullscreen-shell";
import CopyInput from "@/components/misc/copy-input";
import { Pagination } from "@/components/data-table/parts/pagination";
import {
  FilterToolbar,
  FilterToolbarAction,
  FilterToolbarField,
} from "@/components/filters/filter-toolbar";
import EntityCombobox, {
  useGetAllEntitiesQuery,
} from "@/components/form/entity-combobox";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import Selector from "@/components/form/selectors/selector";
import { queryParamDefault } from "@/config/defaults";
import {
  formatDate,
  getActiveCourseFilterParams,
  getCalendarMonthUtcFilterBounds,
  getCourseMonthType,
} from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import { describeInstallmentCoverageDisplay } from "@/helpers/payment-coverage-months";
import {
  downloadReceiptForPaymentRow,
  notifyReceiptDownloadError,
} from "@/helpers/payment-receipt";
import { snakeToTitle } from "@/helpers/formatters";
import {
  canDownloadPaymentReceipt,
  canRecordRefunds,
  canRecordStudentPayments,
  canVerifyPayments,
  canViewPaymentScreenshots,
  isPaymentMembershipScoped,
} from "@/helpers/authorization";
import { getCourseOfUserFilterParams } from "@/helpers/course";
import { transactionDuplicatesHref } from "@/helpers/student-payments-transaction-lookup";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import {
  getPaymentScreenshotUrl,
  isPaymentFieldEditable,
  isSyntheticPaymentRow,
  paymentFieldApiPayload,
  paymentFieldDisplayValue,
  resolveGroupPaymentDateDisplay,
  resolveUserPaymentId,
  syntheticAllowsInlineCreate,
  isDroppedEnrollmentRow,
  isExemptPaymentExpectationRow,
  isGroupPaymentRow,
  sharedScreenshotNote,
  canShowPaymentReceiptAction,
} from "@/lib/data-sheets/payment-row-utils";
import { invalidateUserPaymentsCaches } from "@/lib/finances/invalidate-user-payments-caches";
import {
  shouldShowStudentPaymentsMonthSelector,
  STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH,
  STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH,
} from "@/lib/finances/student-payments-filter-ui";
import { PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS } from "@/lib/ui/select-layout";
import { makeUserPaymentsSheetAdapter } from "@/lib/data-sheets/user-payments-sheet-adapter";
import { unwrapList } from "@/sdk/core/envelope";
import { filterParamsBody, operatorEnum } from "@/types/api";
import { PaymentBank, UserPaymentStatus } from "@/types/finance";
import {
  TransactionScreenshotStrategy,
  organizationType,
} from "@/types/organization";
import { accountType } from "@/types/user";
import {
  GridCellKind,
  type DataEditorProps,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type Item,
} from "@glideapps/glide-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  parseAsIsoDateTime,
  parseAsString,
  useQueryState,
} from "nuqs";

import {
  findActionSegmentIndex,
  paymentGridCustomRenderers,
} from "@/components/finances/payments-grid/payment-grid-cells";
import {
  PaymentActionsMenu,
  PaymentDatePopover,
  PaymentMethodPopover,
  PaymentStatusPopover,
  type CellAnchorTarget,
  type PaymentActionId,
} from "@/components/finances/payments-grid/payment-grid-overlays";
import {
  PaymentColumnHeaderMenuOverlay,
  type PaymentColumnHeaderMenuTarget,
} from "@/components/finances/payments-grid/payment-column-header-menu-overlay";
import {
  buildPaymentSummaryLine,
  buildRecentTransactionsSummary,
} from "@/components/finances/payments-grid/payment-grid-summary";
import { PaymentGridSummaryStrip } from "@/components/finances/payments-grid/payment-grid-summary-strip";
import { StudentPaymentsMonthNotApplicable } from "@/components/finances/student-payments-month-not-applicable";
import { copyVisibleColumnValues } from "@/helpers/copy-visible-column-values";
import { useContainerHeight } from "@/hooks/use-container-height";
import { paymentAmountValuesForCopy, paymentStudentSlotsForCopy } from "@/lib/finances/payment-column-copy";
import {
  useStudentPaymentsAdminReport,
  type StudentPaymentsAdminReportModel,
} from "@/hooks/finances/use-student-payments-admin-report";

export type StudentPaymentsGridProps = StudentPaymentsReportProps & {
  variant?: "report";
  embedded?: boolean;
  onRowsChange?: (rows: StudentPaymentAdminReportRow[]) => void;
  onOpenStudent?: (userId: number) => void;
  headerActions?: ReactNode;
  /** Shell-owned report instance — avoids duplicate admin-report queries when embedded. */
  report?: StudentPaymentsAdminReportModel;
};

type GridColDef = { id: string; title: string; width: number };

const GLIDE_PAYMENT_ROW_HEIGHT = 34;
const RECENT_TXN_PAGE_SIZE = 20;
const PAYMENTS_DATA_SHEET_CAPABILITIES: SheetCapabilities = {
  undo: true,
  copyPaste: true,
  statusBar: true,
  density: true,
  fontSize: true,
  columnReorder: true,
  columnResize: true,
  sortable: true,
  columnVisibility: true,
  contextMenu: true,
  gotoRow: true,
};

type PaymentsDataSheetProps = {
  sheetRef: React.RefObject<DataEditorRef | null>;
  adapter: ReturnType<typeof makeUserPaymentsSheetAdapter>;
  columns: GridColumn[];
  fieldByColumn: (string | null)[];
  getCellContent: ([col, row]: Item) => GridCell;
  roleLabel: string;
  height: number;
  className?: string;
  fullscreenSlot?: ReactNode;
  columnLayoutApiRef?: React.MutableRefObject<DataSheetColumnLayoutApi | null>;
  gridProps: Partial<DataEditorProps> & {
    freezeColumns: number;
    onCellEdited: ([col, row]: Item, newValue: EditableGridCell) => void;
    onCellClicked: (
      cell: Item,
      event: {
        localEventX: number;
        bounds: { x: number; y: number; width: number; height: number };
      },
    ) => void;
    rowHeight: number;
  };
};

const PaymentsDataSheet = memo(function PaymentsDataSheet({
  sheetRef,
  adapter,
  columns,
  fieldByColumn,
  getCellContent,
  roleLabel,
  height,
  className,
  fullscreenSlot,
  columnLayoutApiRef,
  gridProps,
}: PaymentsDataSheetProps) {
  return (
    <DataSheet
      ref={sheetRef}
      adapter={adapter}
      columns={columns}
      fieldByColumn={fieldByColumn}
      getCellContent={getCellContent}
      customRenderers={paymentGridCustomRenderers}
      menus={{ roleLabel }}
      capabilities={PAYMENTS_DATA_SHEET_CAPABILITIES}
      height={height}
      className={className}
      fullscreenSlot={fullscreenSlot}
      columnLayoutApiRef={columnLayoutApiRef}
      gridProps={gridProps}
    />
  );
});

type StudentPaymentsGridContentProps = Omit<StudentPaymentsGridProps, "report"> & {
  report: StudentPaymentsAdminReportModel | null;
  urlTransactionId: string;
  setUrlTransactionId: (value: string | null) => void;
  urlMonthDate: Date;
};

function getPaymentPartCount(row: StudentPaymentAdminReportRow): number {
  return row.part_count ?? row.parts?.length ?? 0;
}

function formatTransactionCount(count: number): string {
  return `${count} transaction${count === 1 ? "" : "s"}`;
}

export function StudentPaymentsGrid(props: StudentPaymentsGridProps) {
  return <StudentPaymentsReportGrid {...props} variant="report" />;
}

function StudentPaymentsReportGrid(props: StudentPaymentsGridProps) {
  if (props.report) {
    return (
      <StudentPaymentsGridContent
        {...props}
        report={props.report}
        urlTransactionId={props.report.transactionId}
        setUrlTransactionId={props.report.setTransactionId}
        urlMonthDate={props.report.monthDate}
      />
    );
  }
  return <StudentPaymentsReportGridWithHook {...props} />;
}

function StudentPaymentsReportGridWithHook(
  props: Omit<StudentPaymentsGridProps, "report">,
) {
  const { fixedCourseId, courseMeta, globalTransactionLookup = false } = props;
  const tableUid = useMemo(() => {
    if (globalTransactionLookup) return "student-payments-txn-lookup";
    return fixedCourseId
      ? `student-payments-course-${fixedCourseId}`
      : "student-payments";
  }, [fixedCourseId, globalTransactionLookup]);
  const report = useStudentPaymentsAdminReport({
    fixedCourseId,
    courseMeta,
    globalTransactionLookup,
    tableUid,
  });

  return (
    <StudentPaymentsGridContent
      {...props}
      report={report}
      urlTransactionId={report.transactionId}
      setUrlTransactionId={report.setTransactionId}
      urlMonthDate={report.monthDate}
    />
  );
}

function StudentPaymentsGridContent({
  variant = "report",
  embedded = false,
  fixedCourseId,
  courseMeta,
  globalTransactionLookup = false,
  onRowsChange,
  onOpenStudent,
  headerActions,
  report,
  urlTransactionId,
  setUrlTransactionId,
  urlMonthDate,
}: StudentPaymentsGridContentProps) {
  const isReport = true;
  const isRecent = false;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const { user } = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { effectiveFullscreen, setAvailability } = useFullscreen();
  const noopSetString = useCallback((_value: string | null) => {}, []);
  const noopSetDate = useCallback((_value: Date) => {}, []);
  const noopSetSelectedCourse = useCallback(
    (_value: SetStateAction<StudentPaymentsCourseMeta | null>) => {},
    [],
  );

  const transactionId = isReport
    ? (report?.transactionId ?? "")
    : urlTransactionId;
  const setTransactionId = isReport
    ? (report?.setTransactionId ?? setUrlTransactionId)
    : setUrlTransactionId;
  const status = isReport ? (report?.status ?? null) : null;
  const setStatus = report?.setStatus ?? noopSetString;
  const courseIdFromUrl = report?.courseIdFromUrl ?? "";
  const setCourseIdFromUrl = report?.setCourseIdFromUrl ?? noopSetString;
  const setDate = report?.setDate ?? noopSetDate;
  const monthDate = isReport ? (report?.monthDate ?? urlMonthDate) : urlMonthDate;
  const selectedCourseEntity = report?.selectedCourseEntity ?? null;
  const setSelectedCourseEntity =
    report?.setSelectedCourseEntity ?? noopSetSelectedCourse;
  const hideCourseColumn = isReport && Boolean(report?.hideCourseColumn);

  const [recentDate, setRecentDate] = useState<Date | undefined>(undefined);
  const [recentCourseId, setRecentCourseId] = useState("");
  const [recentStatus, setRecentStatus] = useState<
    UserPaymentStatus | undefined
  >(undefined);
  const [recentBanks, setRecentBanks] = useState<PaymentBank[]>([]);
  const [recentPage, setRecentPage] = useState(1);

  const showBankFilter =
    isRecent &&
    tenant?.transaction_screenshot_strategy !==
      TransactionScreenshotStrategy.user_upload;

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const dataSheetRef = useRef<DataEditorRef>(null);

  const [recentRows, setRecentRows] = useState<StudentPaymentAdminReportRow[]>([]);
  const rows = isReport ? (report?.rows ?? []) : recentRows;
  const setRows = isReport ? (report?.setRows ?? setRecentRows) : setRecentRows;
  const apiSummary = isReport ? (report?.apiSummary ?? null) : null;
  const monthApplicable = isReport ? (report?.monthApplicable ?? true) : true;
  const suggestedMonth = isReport ? (report?.suggestedMonth ?? null) : null;
  const coursePaymentPlan = isReport ? (report?.coursePaymentPlan ?? null) : null;
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [coverageEdit, setCoverageEdit] = useState<{
    paymentIds: number[];
    courseStartDate: string | null;
    courseEndDate: string | null;
  } | null>(null);
  const [adjustmentsRow, setAdjustmentsRow] =
    useState<StudentPaymentAdminReportRow | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<
    number | string | null
  >(null);

  const [statusTarget, setStatusTarget] = useState<CellAnchorTarget | null>(
    null,
  );
  const [methodTarget, setMethodTarget] = useState<CellAnchorTarget | null>(
    null,
  );
  const [paymentDateTarget, setPaymentDateTarget] =
    useState<CellAnchorTarget | null>(null);
  const [actionsTarget, setActionsTarget] = useState<CellAnchorTarget | null>(
    null,
  );
  const [headerMenuTarget, setHeaderMenuTarget] =
    useState<PaymentColumnHeaderMenuTarget | null>(null);
  const columnLayoutApiRef = useRef<DataSheetColumnLayoutApi | null>(null);

  const tableUid = report?.tableUid ?? "student-payments";

  const recentFilterParams = useMemo((): filterParamsBody => {
    return { filter_params: [] };
  }, []);

  const activeFilterParams = isReport
    ? (report?.reportFilterParams ?? { filter_params: [] })
    : recentFilterParams;

  const recentFilterKey = useMemo(
    () =>
      JSON.stringify({
        transactionId,
        recentDate: recentDate?.toISOString() ?? null,
        recentCourseId,
        recentStatus: recentStatus ?? null,
        recentBanks,
      }),
    [
      transactionId,
      recentDate,
      recentCourseId,
      recentStatus,
      recentBanks,
    ],
  );

  useEffect(() => {
    if (!isRecent) return;
    setRecentPage(1);
  }, [isRecent, recentFilterKey]);

  const queryEnabled =
    isReport
      ? Boolean(report?.queryEnabled)
      : Boolean(user) &&
        Boolean(tenant) &&
        (isPaymentMembershipScoped(user!)
          ? (activeFilterParams.filter_params?.length ?? 0) > 0
          : true);

  const recentDataQuery = useQuery({
    queryKey: [
      "searchuser-payments",
      tableUid,
      activeFilterParams,
      "search",
      variant,
      recentPage,
      RECENT_TXN_PAGE_SIZE,
    ],
    queryFn: async () => {
      const res = await searchEntities(
        "user-payments",
        {
          ...queryParamDefault,
          page: recentPage,
          size: RECENT_TXN_PAGE_SIZE,
          fields: [
            "id",
            "user.id",
            "user.name",
            "course.title",
            "transaction_id",
            "status",
            "description",
            "remarks",
            "created_by.name",
            "billing_start_date",
            "billing_end_date",
            "date_on_screenshot",
            "payment_method.name",
            "payment_method.payment_bank",
            "payment_method.id",
            "parsed_amount",
            "screenshot",
            "issued_at",
            "payment_date",
            "created_at",
            "group_id",
            "shared_screenshot_courses",
          ],
          expand: ["user", "course", "payment_method", "created_by"],
          sorts: ["-updated_at", "-created_at"],
        },
        activeFilterParams,
      );
      const { rows, total } = unwrapList<StudentPaymentAdminReportRow>(res, {
        pageSize: RECENT_TXN_PAGE_SIZE,
      });
      return {
        rows,
        total,
      };
    },
    enabled: isRecent && queryEnabled,
  });

  const showSkeleton =
    isReport
      ? Boolean(report?.showSkeleton)
      : !user || !tenant || (queryEnabled && recentDataQuery.isInitialLoading);
  const isDataError = isReport
    ? Boolean(report?.isError)
    : recentDataQuery.isError;
  const queryRows = isReport
    ? report?.queryRows
    : recentDataQuery.data?.rows;
  const recentTotalCount = isReport ? 0 : (recentDataQuery.data?.total ?? 0);

  useEffect(() => {
    if (!isReport && recentDataQuery.data) {
      setRows(recentDataQuery.data.rows);
    }
  }, [isReport, recentDataQuery.data, setRows]);

  useEffect(() => {
    onRowsChange?.(rows);
  }, [rows, onRowsChange]);

  useEffect(() => {
    setAvailability({ enabled: true, label: "Payments grid fullscreen" });
    return () => setAvailability({ enabled: false });
  }, [setAvailability]);

  const paymentMethodsListQuery = useGetAllEntitiesQuery(
    "payment-methods",
    { fields: ["name", "id"], sorts: ["name"] },
    undefined,
    {
      enabled:
        Boolean(tenant) &&
        tenant!.transaction_screenshot_strategy !==
          TransactionScreenshotStrategy.user_upload,
    },
  );

  const paymentMethodOptions = useMemo(() => {
    const list = paymentMethodsListQuery.data?.data?.data as
      | { id: number; name?: string | null }[]
      | undefined;
    if (!Array.isArray(list)) return [];
    return list
      .filter((c) => c?.id != null && isValidApiEntityIdParam(String(c.id)))
      .map((c) => ({
        value: String(c.id),
        label: c.name?.length ? c.name : `Account #${c.id}`,
      }));
  }, [paymentMethodsListQuery.data]);

  const canVerify = Boolean(user && canVerifyPayments(user));
  const canViewScreenshots = Boolean(user && canViewPaymentScreenshots(user));
  const canRecord = Boolean(user && canRecordStudentPayments(user));
  const canManageRefunds = Boolean(user && canRecordRefunds(user));
  const userUploadStrategy =
    tenant?.transaction_screenshot_strategy ===
    TransactionScreenshotStrategy.user_upload;

  const showRemainingAmount = useMemo(
    () =>
      rows.some(
        (row) => row.remaining_amount != null && row.remaining_amount !== "",
      ),
    [rows],
  );

  const gridCols = useMemo((): GridColDef[] => {
    const cols: GridColDef[] = [];
    if (isReport) {
      cols.push({ id: "_serial", title: "No.", width: 64 });
    }
    cols.push({ id: "user__name", title: "Student", width: 200 });
    cols.push({ id: "user__email", title: "Email", width: 220 });
    if (!hideCourseColumn) {
      cols.push({ id: "course", title: "Course", width: 200 });
    }
    if (userUploadStrategy) {
      cols.push({
        id: "billing_start_date",
        title: "Billing Period",
        width: 180,
      });
      if (canVerify) {
        cols.push({ id: "parsed_amount", title: "Amount", width: 140 });
      }
      if (showRemainingAmount) {
        cols.push({
          id: "remaining_amount",
          title: "Remaining amount",
          width: 160,
        });
      }
    } else {
      if (canVerify) {
        cols.push({ id: "parsed_amount", title: "Amount", width: 140 });
      }
      if (showRemainingAmount) {
        cols.push({
          id: "remaining_amount",
          title: "Remaining amount",
          width: 160,
        });
      }
      cols.push(
        { id: "payment_method__name", title: "Payment Account", width: 160 },
        { id: "payment_method__payment_bank", title: "Bank", width: 100 },
        {
          id: "date_on_screenshot",
          title: "Date on Screenshot",
          width: 140,
        },
      );
    }
    cols.push({ id: "status", title: "Status", width: 150 });
    cols.push(
      {
        id: "transaction_id",
        title: "Transaction ID",
        width: STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH,
      },
      {
        id: "description",
        title: "Description",
        width: STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH,
      },
      { id: "remarks", title: "Remarks", width: 180 },
      { id: "payment_date", title: "Payment date", width: 130 },
      { id: "created_by", title: "Created By", width: 130 },
    );
    if (canViewScreenshots) {
      cols.push({ id: "_actions", title: "Actions", width: 220 });
    }
    return cols;
  }, [isReport, hideCourseColumn, canVerify, canViewScreenshots, userUploadStrategy, showRemainingAmount]);

  const columns = useMemo<GridColumn[]>(
    () => gridCols.map((c) => ({ id: c.id, title: c.title, width: c.width })),
    [gridCols],
  );
  const fieldByColumn = useMemo(
    () => gridCols.map((c) => c.id),
    [gridCols],
  );

  const createSyntheticPayment = useCallback(
    async (
      row: StudentPaymentAdminReportRow,
      fieldName: string,
      value: string,
    ) => {
      const bounds = getCalendarMonthUtcFilterBounds(monthDate);
      const formData = new FormData();
      formData.append("user", String(row.user?.id));
      formData.append("course", String(row.course?.id));
      formData.append("issued_at", bounds.start.toISOString());
      formData.append("billing_start_date", bounds.start.toISOString());
      formData.append("billing_end_date", bounds.end.toISOString());
      if (user?.id) formData.append("created_by", String(user.id));
      if (value) formData.append(fieldName, value);
      return makePostRequest(
        "scan-transaction-screenshots",
        formData,
        {},
        { "Content-Type": "multipart/form-data" },
      );
    },
    [monthDate, user?.id],
  );

  const persistCellMutation = useMutation({
    mutationFn: async ({
      row,
      field,
      value,
    }: {
      row: StudentPaymentAdminReportRow;
      field: string;
      value: string;
    }) => {
      if (syntheticAllowsInlineCreate(row)) {
        return createSyntheticPayment(row, field, value);
      }
      return updateEntity(
        "user-payments",
        row.id,
        paymentFieldApiPayload(field, value),
      );
    },
    onSuccess: () => {
      void invalidateUserPaymentsCaches(queryClient, { tableUid });
    },
    onError: () => {
      if (queryRows) setRows(queryRows);
      toast.add({ type: "error", description: "Could not save change." });
    },
  });

  const onLocalUpdate = useCallback(
    (rowIndex: number, field: string, value: string) => {
      setRows((prev) => {
        const copy = [...prev];
        const row = { ...copy[rowIndex]! };
        if (field === "parsed_amount") row.parsed_amount = value || null;
        else if (field === "transaction_id") row.transaction_id = value || null;
        else if (field === "description") row.description = value || null;
        else if (field === "remarks") row.remarks = value || null;
        else if (field === "date_on_screenshot")
          row.date_on_screenshot = value || null;
        else if (field === "payment_date")
          row.payment_date = value || null;
        copy[rowIndex] = row;
        return copy;
      });
    },
    [],
  );

  const adapter = useMemo(
    () =>
      makeUserPaymentsSheetAdapter({
        rows,
        onLocalUpdate,
        onPersistCell: (row, field, value) => {
          persistCellMutation.mutate({ row, field, value });
        },
      }),
    [rows, onLocalUpdate, persistCellMutation],
  );

  const getActionLabels = useCallback(
    (row: StudentPaymentAdminReportRow): string[] => {
      const labels: string[] = [];
      if (syntheticAllowsInlineCreate(row)) {
        if (canRecord) labels.push("Upload");
        return labels;
      }
      const screenshotUrl = getPaymentScreenshotUrl(row);
      const isGroup = isGroupPaymentRow(row);
      if (isGroup) {
        labels.push(formatTransactionCount(getPaymentPartCount(row)));
      }
      if (canViewScreenshots && screenshotUrl) labels.push("View image");
      else if (canRecord && !isExemptPaymentExpectationRow(row)) labels.push("Upload");
      if (
        row.status === UserPaymentStatus.verified &&
        user &&
        canDownloadPaymentReceipt(user) &&
        canShowPaymentReceiptAction(row)
      ) {
        labels.push("Receipt");
      }
      if (isGroup) {
        if (canVerify && !isSyntheticPaymentRow(row)) labels.push("Delete");
        return labels;
      }
      if (!row.is_installment && !isSyntheticPaymentRow(row)) {
        labels.push("Coverage");
      }
      if (row.status === UserPaymentStatus.duplicated) labels.push("Duplicates");
      if (
        canManageRefunds &&
        resolveUserPaymentId(row) != null &&
        !isSyntheticPaymentRow(row)
      ) {
        const count = row.adjustment_count ?? 0;
        labels.push(count > 0 ? `Refunds (${count})` : "Refunds");
      }
      if (canVerify && !isSyntheticPaymentRow(row)) labels.push("Delete");
      return labels;
    },
    [user, canViewScreenshots, canRecord, canVerify, canManageRefunds],
  );

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const field = fieldByColumn[col];
      const record = rows[row];
      if (!record || !field) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
        };
      }

      if (field === "_serial") {
        const n = row + 1;
        return {
          kind: GridCellKind.Text,
          data: String(n),
          displayData: String(n),
          allowOverlay: false,
          readonly: true,
          contentAlign: "center",
        };
      }

      if (field === "user__name") {
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: record.user?.name ?? "",
          data: {
            kind: "payment-student-cell",
            name: record.user?.name ?? "—",
            overlapWarning: Boolean(record.month_overlap_duplicate_coverage),
            sharedNote: sharedScreenshotNote(record),
          },
        };
      }

      if (field === "user__email") {
        const email = record.user?.email ?? "";
        return {
          kind: GridCellKind.Text,
          data: email,
          displayData: email || "—",
          allowOverlay: false,
          readonly: true,
          copyData: email,
        };
      }

      if (field === "status") {
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: record.status,
          data: {
            kind: "payment-status-cell",
            status: record.status,
            isDropped: isDroppedEnrollmentRow(record),
            isSyntheticUpload: syntheticAllowsInlineCreate(record),
          },
        };
      }

      if (field === "_actions") {
        const labels = getActionLabels(record);
        return {
          kind: GridCellKind.Custom,
          allowOverlay: false,
          readonly: true,
          copyData: labels.join(", "),
          data: { kind: "payment-actions-cell", labels },
        };
      }

      if (field === "billing_start_date") {
        const display =
          record.billing_start_date && record.billing_end_date
            ? `${formatDate(record.billing_start_date)} - ${formatDate(record.billing_end_date)}`
            : record.issued_at
              ? formatDate(record.issued_at)
              : "—";
        return {
          kind: GridCellKind.Text,
          data: display,
          displayData: display,
          allowOverlay: false,
          readonly: true,
        };
      }

      if (field === "parsed_amount") {
        const raw = paymentFieldDisplayValue(record, "parsed_amount");
        const cumulative = describeInstallmentCoverageDisplay({
          installment_cumulative_percent: record.installment_cumulative_percent,
          installment_covered_through: record.installment_covered_through,
        });
        const display = raw ? formatMoney(raw, currencySymbol) : "-";
        const suffix = cumulative ? `\n${cumulative}` : "";
        return {
          kind: GridCellKind.Number,
          data: raw === "" ? undefined : Number(raw),
          displayData: display + suffix,
          allowOverlay: isPaymentFieldEditable(record, "parsed_amount"),
          readonly: !isPaymentFieldEditable(record, "parsed_amount"),
          contentAlign: "right",
        };
      }

      if (field === "remaining_amount") {
        const raw = record.remaining_amount;
        const display =
          raw == null || raw === ""
            ? "—"
            : formatMoney(String(raw), currencySymbol);
        return {
          kind: GridCellKind.Text,
          data: display,
          displayData: display,
          allowOverlay: false,
          readonly: true,
          contentAlign: "right",
        };
      }

      if (field === "payment_method__name") {
        const display = record.payment_method?.name ?? "—";
        return {
          kind: GridCellKind.Text,
          data: display,
          displayData: display,
          allowOverlay: false,
          readonly: true,
        };
      }

      if (field === "payment_method__payment_bank") {
        const display = record.payment_method?.payment_bank ?? "—";
        return {
          kind: GridCellKind.Text,
          data: display,
          displayData: display,
          allowOverlay: false,
          readonly: true,
        };
      }

      if (field === "payment_date") {
        const raw = resolveGroupPaymentDateDisplay(record);
        const display = raw ? formatDate(raw) : "—";
        return {
          kind: GridCellKind.Text,
          data: raw,
          displayData: display,
          allowOverlay: false,
          readonly: true,
        };
      }

      const editableFields = new Set([
        "transaction_id",
        "description",
        "remarks",
        "date_on_screenshot",
      ]);
      if (field === "transaction_id" && isGroupPaymentRow(record)) {
        const shared = record.transaction_id?.trim();
        const display = shared
          ? shared
          : formatTransactionCount(getPaymentPartCount(record));
        return {
          kind: GridCellKind.Text,
          data: display,
          displayData: display,
          allowOverlay: false,
          readonly: true,
        };
      }
      if (editableFields.has(field)) {
        const raw = paymentFieldDisplayValue(record, field);
        const display = raw || "-";
        const editable = isPaymentFieldEditable(record, field);
        return {
          kind: GridCellKind.Text,
          data: raw,
          displayData: display,
          allowOverlay: editable,
          readonly: !editable,
        };
      }

      const value = paymentFieldDisplayValue(record, field) || "—";
      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
        readonly: true,
      };
    },
    [fieldByColumn, rows, currencySymbol, getActionLabels],
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      const field = fieldByColumn[col];
      if (!field) return;
      const record = rows[row];
      if (!record || !isPaymentFieldEditable(record, field)) return;

      let value = "";
      if (newValue.kind === GridCellKind.Text) value = newValue.data.trim();
      else if (newValue.kind === GridCellKind.Number) {
        value =
          newValue.data === undefined || newValue.data === null
            ? ""
            : String(newValue.data);
      } else return;

      onLocalUpdate(row, field, value);
      persistCellMutation.mutate({ row: record, field, value });
    },
    [fieldByColumn, rows, onLocalUpdate, persistCellMutation],
  );

  const openCoverageEditForRow = (row: StudentPaymentAdminReportRow) => {
    if (isSyntheticPaymentRow(row) || typeof row.id !== "number") return;
    setCoverageEdit({
      paymentIds: [row.id],
      courseStartDate: row.course?.start_date ?? null,
      courseEndDate: row.course?.end_date ?? null,
    });
  };

  const handleDownloadReceipt = async (row: StudentPaymentAdminReportRow) => {
    if (!tenant) return;
    setDownloadingReceiptId(row.id);
    try {
      await downloadReceiptForPaymentRow(
        row,
        tenant,
        currencySymbol,
        user?.name ?? null,
      );
    } catch (err) {
      notifyReceiptDownloadError(toast, err);
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const runAction = useCallback(
    (actionId: PaymentActionId, row: StudentPaymentAdminReportRow) => {
      switch (actionId) {
        case "view":
          {
            const screenshotUrl = getPaymentScreenshotUrl(row);
            if (screenshotUrl) setViewImageUrl(screenshotUrl);
          }
          break;
        case "download_receipt":
          void handleDownloadReceipt(row);
          break;
        case "duplicate_search": {
          const tid = row.transaction_id?.trim();
          if (tid)
            router.push(transactionDuplicatesHref(tid, pathname, searchParams));
          break;
        }
        case "edit_coverage":
          openCoverageEditForRow(row);
          break;
        case "upload_screenshot": {
          const qs = new URLSearchParams({
            courseId: String(row.course?.id ?? ""),
            userId: String(row.user?.id ?? ""),
            date: monthDate.toISOString(),
          });
          router.push(`/finances/student-payments/upload?${qs}`);
          break;
        }
        case "refunds":
          setAdjustmentsRow(row);
          break;
        default:
          break;
      }
    },
    [router, pathname, searchParams, tenant, currencySymbol, monthDate],
  );

  const mapActionLabelToId = (
    label: string,
    row: StudentPaymentAdminReportRow,
  ): PaymentActionId | null => {
    switch (label) {
      case "View image":
        return "view";
      case "Receipt":
        return "download_receipt";
      case "Duplicates":
        return "duplicate_search";
      case "Coverage":
        return "edit_coverage";
      case "Upload":
        return "upload_screenshot";
      case "Delete":
        return "delete";
      default:
        if (label.startsWith("Refunds")) return "refunds";
        return null;
    }
  };

  const handleCellClicked = useCallback(
    (
      cell: Item,
      event: {
        localEventX: number;
        bounds: { x: number; y: number; width: number; height: number };
      },
    ) => {
      const [col, row] = cell;
      const field = fieldByColumn[col];
      const record = rows[row];
      if (!field || !record) return;

      const target: CellAnchorTarget = {
        rowIndex: row,
        rect: event.bounds,
      };

      if (field === "status" && !isDroppedEnrollmentRow(record)) {
        if (!syntheticAllowsInlineCreate(record) && !isGroupPaymentRow(record)) {
          setStatusTarget(target);
        }
        return;
      }

      if (field === "payment_method__name") {
        if (!isGroupPaymentRow(record)) {
          setMethodTarget(target);
        }
        return;
      }

      if (field === "payment_date") {
        if (isPaymentFieldEditable(record, "payment_date")) {
          setPaymentDateTarget(target);
        }
        return;
      }

      if (field === "user__name") {
        const uid = record.user?.id;
        if (uid != null) {
          onOpenStudent?.(Number(uid));
        }
        return;
      }

      if (field === "_actions") {
        const labels = getActionLabels(record);
        const padX = fontCellPaddingFor(getActiveFontPx()).cellHorizontalPadding;
        const idx = findActionSegmentIndex(labels, event.localEventX, padX);
        if (idx >= 0) {
          const actionId = mapActionLabelToId(labels[idx]!, record);
          if (actionId && actionId !== "delete") {
            runAction(actionId, record);
            return;
          }
        }
        setActionsTarget(target);
      }
    },
    [
      fieldByColumn,
      rows,
      getActionLabels,
      runAction,
      onOpenStudent,
    ],
  );

  const gridProps = useMemo(
    () => ({
      freezeColumns: isReport ? 2 : 1,
      onCellEdited,
      onCellClicked: handleCellClicked,
      onHeaderClicked: (
        colIndex: number,
        event: {
          bounds: { x: number; y: number; width: number; height: number };
          preventDefault: () => void;
        },
      ) => {
        const field = fieldByColumn[colIndex];
        const isCopyableHeader =
          field === "user__name" ||
          field === "user__email" ||
          (canVerify && field === "parsed_amount");
        if (!isCopyableHeader) return;
        event.preventDefault();
        const sort = columnLayoutApiRef.current?.getSort() ?? null;
        const sorted: "asc" | "desc" | false =
          sort?.field === field
            ? sort.direction === "asc"
              ? "asc"
              : "desc"
            : false;
        setHeaderMenuTarget({
          columnId: field as PaymentColumnHeaderMenuTarget["columnId"],
          rect: event.bounds,
          sorted,
        });
      },
    }),
    [isReport, onCellEdited, handleCellClicked, fieldByColumn, canVerify],
  );

  const measuredHeight = useContainerHeight(gridContainerRef, [
    effectiveFullscreen,
    embedded,
    rows.length,
    showSkeleton,
    isReport,
    fixedCourseId,
    courseMeta?.start_date,
    selectedCourseEntity?.id,
  ]);
  const gridHeight = measuredHeight;

  const gridVisible =
    !showSkeleton && !isDataError && rows.length > 0;

  useEffect(() => {
    if (!gridVisible) return;
    const frame = requestAnimationFrame(() => {
      const editor = dataSheetRef.current;
      if (!editor) return;
      const rowCap = Math.min(rows.length, 50);
      const colCap = fieldByColumn.length;
      const damage: { cell: Item }[] = [];
      for (let c = 0; c < colCap; c++) {
        for (let r = 0; r < rowCap; r++) {
          damage.push({ cell: [c, r] });
        }
      }
      if (damage.length > 0) {
        editor.updateCells(damage);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [gridVisible, rows.length, fieldByColumn.length]);

  const dataSheetRoleLabel = isReport ? "Student payments" : "Recent transactions";

  const dataSheetGridProps = useMemo(
    () => ({
      ...gridProps,
      rowHeight: GLIDE_PAYMENT_ROW_HEIGHT,
    }),
    [gridProps],
  );

  const dataSheetFullscreenSlot = useMemo(
    () => (effectiveFullscreen ? undefined : <FullscreenToggle />),
    [effectiveFullscreen],
  );

  const overlayRow = (target: CellAnchorTarget | null) =>
    target != null ? (rows[target.rowIndex] ?? null) : null;

  const actionItems = useMemo(() => {
    const row = overlayRow(actionsTarget);
    if (!row) return [];
    return getActionLabels(row)
      .map((label) => {
        const id = mapActionLabelToId(label, row);
        return id ? { id, label, destructive: id === "delete" } : null;
      })
      .filter(Boolean) as {
      id: PaymentActionId;
      label: string;
      destructive?: boolean;
    }[];
  }, [actionsTarget, rows, getActionLabels]);

  const summaryLine = isReport
    ? buildPaymentSummaryLine(
        rows,
        apiSummary,
        currencySymbol,
        fixedCourseId,
        monthApplicable,
      )
    : buildRecentTransactionsSummary(
        rows,
        recentDataQuery.data ? recentTotalCount : undefined,
      );

  const monthTypeStartDate =
    selectedCourseEntity?.start_date ?? courseMeta?.start_date;
  const monthType = monthTypeStartDate
    ? getCourseMonthType(monthTypeStartDate)
    : null;

  const filterControls = (
    <div className="space-y-3">
      <FilterToolbar className="items-start gap-x-4 gap-y-3">
        <FilterToolbarField label="Transaction ID" width="md">
          <Input
            className="h-10 w-full"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
          />
        </FilterToolbarField>
        {shouldShowStudentPaymentsMonthSelector({
          globalTransactionLookup: Boolean(globalTransactionLookup),
          isReport,
        }) ? (
          <YearMonthSelector
            layout="toolbar"
            label="Month"
            date={monthDate}
            setDate={setDate}
            monthType={monthType}
          />
        ) : null}
        {isRecent ? (
          <FilterToolbarField label="Date" width="md">
            <DatePicker date={recentDate} setDate={setRecentDate} />
          </FilterToolbarField>
        ) : null}
        {user && ((isReport && !fixedCourseId && !globalTransactionLookup) || isRecent) ? (
          <EntityCombobox
            filterParams={{
              filter_params: isRecent
                ? getActiveCourseFilterParams()
                : getCourseOfUserFilterParams(user).filter_params,
            }}
            queryParams={{
              fields: ["title", "id", "start_date", "end_date"],
              sorts: ["title"],
            }}
            displayFunction={(e) => e.title}
            entity="courses"
            value={isRecent ? recentCourseId : courseIdFromUrl}
            onChange={(v) => {
              if (isRecent) {
                setRecentCourseId(v);
                return;
              }
              setCourseIdFromUrl(v);
              if (!v) setSelectedCourseEntity(null);
            }}
            onSelectedEntityChange={(entity) => {
              if (isRecent || fixedCourseId) return;
              if (!entity) {
                setSelectedCourseEntity(null);
                return;
              }
              setSelectedCourseEntity({
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
          value={isRecent ? recentStatus : (status as UserPaymentStatus | undefined)}
          onChange={(v) =>
            isRecent
              ? setRecentStatus(v as UserPaymentStatus)
              : setStatus(v)
          }
          label="Status"
          layout="toolbar"
          containerClassName={PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS}
        />
        {showBankFilter ? (
          <PaymentBankMultiSelectFilter
            selectedBanks={recentBanks}
            onSelectedBanksChange={setRecentBanks}
          />
        ) : null}
        <FilterToolbarAction>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="shrink-0 active:scale-[0.98]"
            onClick={() => {
              if (isReport) {
                report?.clearFilters();
              } else {
                setTransactionId("");
                setRecentDate(undefined);
                setRecentCourseId("");
                setRecentStatus(undefined);
                setRecentBanks([]);
                setRecentPage(1);
              }
            }}
          >
            Clear
          </Button>
        </FilterToolbarAction>
      </FilterToolbar>
      {showBankFilter ? (
        <PaymentBankFilterChips
          selectedBanks={recentBanks}
          onSelectedBanksChange={setRecentBanks}
        />
      ) : null}
      {isReport ? (
        <CopyInput
          disabled
          className="w-full max-w-xl space-y-1.5"
          labelClassName="text-xs font-normal text-muted-foreground"
          text={typeof window !== "undefined" ? window.location.href : ""}
          label="Share link"
        />
      ) : null}
    </div>
  );

  const summaryStrip = (
    <PaymentGridSummaryStrip
      rows={rows}
      apiSummary={apiSummary}
      currencySymbol={currencySymbol}
      fixedCourseId={fixedCourseId}
      courseMeta={courseMeta}
      selectedCourse={selectedCourseEntity}
      coursePaymentPlan={coursePaymentPlan}
      monthAnchor={isReport ? monthDate : (recentDate ?? new Date())}
      variant={isRecent ? "recent-transactions" : "report"}
      monthApplicable={monthApplicable}
      totalCount={
        isRecent && recentDataQuery.data ? recentTotalCount : undefined
      }
    />
  );

  const gridWithOverlays =
    showSkeleton ? (
      <Skeleton className="h-full min-h-[240px] w-full rounded-md" aria-busy />
    ) : isDataError ? (
      <p className="flex h-full min-h-[200px] items-center p-4 text-sm text-destructive" role="alert">
        Failed to load payments. Please try again.
      </p>
    ) : isReport && !monthApplicable ? (
      <StudentPaymentsMonthNotApplicable
        selectedMonth={monthDate}
        courseStartDate={
          selectedCourseEntity?.start_date ?? courseMeta?.start_date
        }
        courseEndDate={selectedCourseEntity?.end_date ?? courseMeta?.end_date}
        suggestedMonth={suggestedMonth}
        onGoToMonth={setDate}
      />
    ) : rows.length === 0 ? (
      <p className="flex h-full min-h-[200px] items-center justify-center p-4 text-sm text-muted-foreground">
        {isRecent
          ? "No transactions match the current filters."
          : "No payments match the current filters."}
      </p>
    ) : (
      <>
        <PaymentsDataSheet
          sheetRef={dataSheetRef}
          adapter={adapter}
          columns={columns}
          fieldByColumn={fieldByColumn}
          getCellContent={getCellContent}
          roleLabel={dataSheetRoleLabel}
          height={gridHeight}
          className={
            effectiveFullscreen ? "h-full min-h-0 rounded-none border-0" : undefined
          }
          fullscreenSlot={dataSheetFullscreenSlot}
          columnLayoutApiRef={columnLayoutApiRef}
          gridProps={dataSheetGridProps}
        />
        <PaymentColumnHeaderMenuOverlay
          target={headerMenuTarget}
          showSort={headerMenuTarget?.columnId !== "parsed_amount"}
          onClose={() => setHeaderMenuTarget(null)}
          onSortAsc={() => {
            if (!headerMenuTarget) return;
            columnLayoutApiRef.current?.setSort(
              headerMenuTarget.columnId,
              "asc",
            );
          }}
          onSortDesc={() => {
            if (!headerMenuTarget) return;
            columnLayoutApiRef.current?.setSort(
              headerMenuTarget.columnId,
              "desc",
            );
          }}
          onClearSort={() => {
            columnLayoutApiRef.current?.setSort(
              headerMenuTarget?.columnId ?? "user__name",
              null,
            );
          }}
          onCopy={() => {
            if (!headerMenuTarget) return;
            if (headerMenuTarget.columnId === "parsed_amount") {
              const values = paymentAmountValuesForCopy(rows);
              if (values.length === 0) {
                toast.add({ description: "Nothing to copy" });
                return;
              }
              const text = copyVisibleColumnValues(values);
              const n = text === "" ? 0 : text.split("\n").length;
              void navigator.clipboard.writeText(text).then(
                () => toast.add({ description: `Copied ${n} amounts` }),
                () => toast.add({ description: "Could not copy to clipboard" }),
              );
              return;
            }
            const field =
              headerMenuTarget.columnId === "user__name" ? "name" : "email";
            const slots = paymentStudentSlotsForCopy(rows);
            if (slots.length === 0) {
              toast.add({ description: "Nothing to copy" });
              return;
            }
            const values = slots.map((s) =>
              field === "name" ? s.name : s.email,
            );
            const dedupedText = copyVisibleColumnValues(values, {
              dedupeKeys: slots.map((s) => s.userId),
            });
            const n = dedupedText === "" ? 0 : dedupedText.split("\n").length;
            void navigator.clipboard.writeText(dedupedText).then(
              () =>
                toast.add({
                  description: `Copied ${n} ${field === "name" ? "names" : "emails"}`,
                }),
              () =>
                toast.add({ description: "Could not copy to clipboard" }),
            );
          }}
        />
        <PaymentStatusPopover
          target={statusTarget}
          row={overlayRow(statusTarget)}
          tableUid={tableUid}
          onClose={() => setStatusTarget(null)}
          onRetryExtraction={() => {
            const row = overlayRow(statusTarget);
            if (!row) return;
            void makePostRequest(
              `user-payments/${row.id}/retry-extraction`,
              {},
            ).then(() => {
              void invalidateUserPaymentsCaches(queryClient, { tableUid });
            });
          }}
        />
        <PaymentMethodPopover
          target={methodTarget}
          row={overlayRow(methodTarget)}
          options={paymentMethodOptions}
          isOptionsLoading={paymentMethodsListQuery.isLoading}
          tableUid={tableUid}
          onClose={() => setMethodTarget(null)}
          onSave={async (row, value) => {
            if (syntheticAllowsInlineCreate(row)) {
              return createSyntheticPayment(row, "payment_method", value);
            }
            return updateEntity("user-payments", row.id, {
              payment_method: value || null,
            });
          }}
        />
        <PaymentDatePopover
          target={paymentDateTarget}
          row={overlayRow(paymentDateTarget)}
          tableUid={tableUid}
          tenantTimezone={tenant?.timezone?.trim() || "UTC"}
          onClose={() => setPaymentDateTarget(null)}
          onSave={async (row, iso) => {
            onLocalUpdate(paymentDateTarget!.rowIndex, "payment_date", iso);
            if (syntheticAllowsInlineCreate(row)) {
              return createSyntheticPayment(row, "payment_date", iso);
            }
            return updateEntity("user-payments", row.id, {
              payment_date: iso,
            });
          }}
        />
        <PaymentActionsMenu
          target={actionsTarget}
          row={overlayRow(actionsTarget)}
          actions={actionItems}
          onAction={(id) => {
            const row = overlayRow(actionsTarget);
            if (row) runAction(id, row);
          }}
          onClose={() => setActionsTarget(null)}
        />
      </>
    );

  const gridPane = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {summaryStrip}
      <div ref={gridContainerRef} className="min-h-0 min-w-0 flex-1 overflow-hidden p-2">
        {gridWithOverlays}
      </div>
      {isRecent && !showSkeleton && !isDataError ? (
        <div className="shrink-0 border-t border-border px-3">
          <Pagination
            page={recentPage}
            pageSize={RECENT_TXN_PAGE_SIZE}
            totalCount={recentTotalCount}
            onPageChange={setRecentPage}
          />
        </div>
      ) : null}
    </div>
  );

  const shellTitle = isReport ? "Student payments" : "Recent transactions";

  const embeddedShell = (
    <>
      <div className="shrink-0 border-b border-border bg-muted/20">
        <div className="px-4 py-3">{filterControls}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {gridPane}
      </div>
    </>
  );

  const shell = (
    <div className="flex min-h-[75dvh] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/25 px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold tracking-tight">{shellTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{summaryLine}</p>
        </div>
        {headerActions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {headerActions}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 border-b border-border bg-muted/20">
        <div className="shrink-0 border-b border-border bg-muted/20">
          <div className="px-4 py-3">{filterControls}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{gridPane}</div>
    </div>
  );

  if (embedded && !effectiveFullscreen) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {embeddedShell}
        <PaymentCoverageEditDialog
          open={coverageEdit !== null}
          onOpenChange={(open) => {
            if (!open) setCoverageEdit(null);
          }}
          paymentIds={coverageEdit?.paymentIds ?? []}
          courseStartDate={coverageEdit?.courseStartDate}
          courseEndDate={coverageEdit?.courseEndDate}
          onSaved={() => {
            void invalidateUserPaymentsCaches(queryClient, { tableUid });
          }}
        />
        <PaymentAdjustmentsDrawer
          paymentRow={adjustmentsRow}
          tableUid={tableUid}
          onClose={() => setAdjustmentsRow(null)}
          onViewImage={(url) => setViewImageUrl(url)}
          canManage={canManageRefunds}
        />
        <FullScreenImageViewer
          imageUrl={viewImageUrl}
          title="Screenshot"
          onClose={() => setViewImageUrl(null)}
        />
      </div>
    );
  }

  return (
    <>
      {effectiveFullscreen ? (
        <SheetFullscreenShell
          layout="grid-first"
          title={shellTitle}
          summary={summaryLine}
          actions={headerActions}
          controls={filterControls}
          main={gridPane}
        />
      ) : (
        shell
      )}

      <PaymentCoverageEditDialog
        open={coverageEdit !== null}
        onOpenChange={(open) => {
          if (!open) setCoverageEdit(null);
        }}
        paymentIds={coverageEdit?.paymentIds ?? []}
        courseStartDate={coverageEdit?.courseStartDate}
        courseEndDate={coverageEdit?.courseEndDate}
        onSaved={() => {
          void invalidateUserPaymentsCaches(queryClient, { tableUid });
        }}
      />

      <PaymentAdjustmentsDrawer
        paymentRow={adjustmentsRow}
        tableUid={tableUid}
        onClose={() => setAdjustmentsRow(null)}
        onViewImage={(url) => setViewImageUrl(url)}
        canManage={canManageRefunds}
      />

      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Screenshot"
        onClose={() => setViewImageUrl(null)}
      />
    </>
  );
}
