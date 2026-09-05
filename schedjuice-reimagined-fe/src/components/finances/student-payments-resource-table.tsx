"use client";

import {
  ResourceTable,
  useResourceTableState,
  type Column,
  type ResourceListResult,
} from "@/components/data-table";
import { applyColumnLayoutMeta } from "@/lib/finances/apply-column-layout-meta";
import { paymentAmountValuesForCopy, paymentStudentSlotsForCopy } from "@/lib/finances/payment-column-copy";
import { CellAutosaveInput, useCellAutosave } from "@/components/edit-kit";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { transactionDuplicatesHref } from "@/components/finances/student-payments-report";
import UserPaymentStatusInlineForm from "@/components/datatable/user-payment-status-inline-form";
import ConfirmationDialog from "@/components/misc/confirmation-dialog";
import { Button, Select, useToast } from "@/components/primitives";
import { useGetAllEntitiesQuery } from "@/components/form/entity-combobox";
import {
  MediaImage as ImageIcon,
  NavArrowDown,
  NavArrowRight,
  Trash,
} from "iconoir-react";
import { formatDate, getCalendarMonthUtcFilterBounds } from "@/helpers/date";
import { getTenantDayBoundariesIso } from "@/helpers/shortcuts-time";
import InlineDatePicker from "@/components/datatable/inline-date-picker";
import { useTenant } from "@/hooks/useTenant";
import { formatInTimeZone } from "date-fns-tz";
import { formatMoney } from "@/helpers/money";
import { copyVisibleColumnValues } from "@/helpers/copy-visible-column-values";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import {
  canDownloadPaymentReceipt,
  canRecordRefunds,
  canRecordStudentPayments,
  canVerifyPayments,
  canViewPaymentScreenshots,
} from "@/helpers/authorization";
import {
  downloadReceiptForPaymentRow,
  notifyReceiptDownloadError,
} from "@/helpers/payment-receipt";
import {
  formatTransactionCount,
  getPaymentPartCount,
  getPaymentScreenshotUrl,
  canShowPaymentReceiptAction,
  isDroppedEnrollmentRow,
  isExemptPaymentExpectationRow,
  isGroupPaymentRow,
  isPaymentFieldEditable,
  isSyntheticPaymentRow,
  paymentFieldApiPayload,
  paymentFieldDisplayValue,
  paymentRowMissingScreenshot,
  resolveGroupPaymentDateDisplay,
  resolveUserPaymentId,
  syntheticAllowsInlineCreate,
  sharedScreenshotNote,
  sharedScreenshotNoteTitles,
  sharedTransactionLookupId,
} from "@/lib/data-sheets/payment-row-utils";
import {
  flattenPaymentReportRows,
  resolveGroupId,
  type FlattenedPaymentRow,
} from "@/lib/finances/flatten-payment-report-rows";
import {
  patchPaymentRowInQueryCaches,
  restoreQueryCacheSnapshots,
  type QueryCacheSnapshot,
} from "@/lib/finances/patch-payment-row-cache";
import { softRefetchStudentPaymentsReport } from "@/lib/finances/soft-refetch-student-payments-report";
import {
  paymentEditableFieldInputClassName,
} from "@/lib/finances/student-payments-filter-ui";
import { studentPaymentsResourceColumnLayout } from "@/lib/finances/student-payments-resource-column-meta";
import {
  buildSyntheticPaymentStubFormData,
  canCreateSyntheticPaymentStub,
} from "@/lib/finances/synthetic-payment-stub";
import {
  deleteEntity,
  makeGetRequest,
  makePostRequest,
  updateEntity,
} from "@/app/client-api/utils";
import { UserPaymentStatus } from "@/types/finance";
import { TransactionScreenshotStrategy } from "@/types/organization";
import { useUser } from "@/hooks/useUser";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StudentPaymentsResourceTableProps = {
  rows: StudentPaymentAdminReportRow[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hideCourseColumn: boolean;
  monthDate: Date;
  onOpenStudent: (userId: number) => void;
  onViewScreenshot: (url: string) => void;
  onEditCoverage: (row: StudentPaymentAdminReportRow) => void;
  onOpenAdjustments?: (row: StudentPaymentAdminReportRow) => void;
  tableUid: string;
};

type RowWithFlatMeta = StudentPaymentAdminReportRow & {
  __flatKind?: FlattenedPaymentRow["kind"];
  __parentGroupId?: number | null;
  __partIndex?: number | null;
  __serial?: number;
};

type EditablePaymentField =
  | "transaction_id"
  | "description"
  | "remarks"
  | "parsed_amount"
  | "date_on_screenshot";

type StubDraft = {
  parsedAmount: string;
  paymentMethodId: string;
  transactionId: string;
  description: string;
  remarks: string;
  dateOnScreenshot: string;
};

function PaymentRowDeleteButton({
  userPaymentId,
  tableUid,
}: {
  userPaymentId: string | number;
  tableUid: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const deleteMutation = useMutation({
    mutationKey: ["deleteUserPayment", userPaymentId],
    mutationFn: () => deleteEntity("user-payments", userPaymentId),
    onSuccess: async () => {
      toast.add({
        title: "Success",
        description: "Transaction successfully deleted.",
      });
      await softRefetchStudentPaymentsReport(queryClient, { tableUid });
    },
    onError: () => {
      toast.add({ type: "error", description: "Could not delete payment." });
    },
  });

  return (
    <ConfirmationDialog
      isLoading={deleteMutation.isPending}
      content="This action cannot be undone"
      onConfirm={() => deleteMutation.mutate()}
    >
      <Button
        aria-label="Delete payment"
        size="sm"
        variant="danger"
        className="h-8 w-full justify-center active:scale-[0.98]"
        disabled={deleteMutation.isPending}
        isLoading={deleteMutation.isPending}
        type="button"
      >
        <Trash className="size-3.5" aria-hidden />
      </Button>
    </ConfirmationDialog>
  );
}

function PaymentGroupDeleteButton({
  groupId,
  tableUid,
}: {
  groupId: number;
  tableUid: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const deleteMutation = useMutation({
    mutationKey: ["deleteUserPaymentGroup", groupId],
    mutationFn: () => deleteEntity("user-payment-groups", groupId),
    onSuccess: async () => {
      toast.add({
        title: "Success",
        description: "Payment group successfully deleted.",
      });
      await softRefetchStudentPaymentsReport(queryClient, { tableUid });
    },
    onError: () => {
      toast.add({ type: "error", description: "Could not delete payment group." });
    },
  });

  return (
    <ConfirmationDialog
      isLoading={deleteMutation.isPending}
      content="This will delete all transactions in this payment group. This action cannot be undone."
      onConfirm={() => deleteMutation.mutate()}
    >
      <Button
        aria-label="Delete payment group"
        size="sm"
        variant="danger"
        className="h-8 w-full justify-center active:scale-[0.98]"
        disabled={deleteMutation.isPending}
        isLoading={deleteMutation.isPending}
        type="button"
      >
        <Trash className="size-3.5" aria-hidden />
      </Button>
    </ConfirmationDialog>
  );
}

function PaymentEditableFieldCell({
  row,
  field,
  tableUid,
  currencySymbol,
  displayOverride,
  onSyntheticChange,
}: {
  row: StudentPaymentAdminReportRow;
  field: EditablePaymentField;
  tableUid: string;
  currencySymbol: string;
  displayOverride?: string;
  onSyntheticChange?: (next: string) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cacheSnapRef = useRef<QueryCacheSnapshot[]>([]);
  const rawValue =
    displayOverride ?? paymentFieldDisplayValue(row, field);
  const autosave = useCellAutosave({
    value: rawValue,
    onOptimisticUpdate: (next) => {
      if (isSyntheticPaymentRow(row) || onSyntheticChange) return;
      cacheSnapRef.current = patchPaymentRowInQueryCaches(queryClient, row.id, {
        [field]: next || null,
      });
    },
    onRollback: () => {
      restoreQueryCacheSnapshots(queryClient, cacheSnapRef.current);
      cacheSnapRef.current = [];
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not save change.",
      });
    },
    onSave: async (next) => {
      if (onSyntheticChange) {
        await onSyntheticChange(next);
        return;
      }
      await updateEntity(
        "user-payments",
        row.id,
        paymentFieldApiPayload(field, next),
      );
      await softRefetchStudentPaymentsReport(queryClient, { tableUid });
    },
  });

  if (field === "transaction_id" && isGroupPaymentRow(row)) {
    const shared = row.transaction_id?.trim();
    if (shared) {
      return <span className="text-left">{shared}</span>;
    }
    return (
      <span className="text-left text-muted-foreground">
        {formatTransactionCount(getPaymentPartCount(row))}
      </span>
    );
  }

  if (!isPaymentFieldEditable(row, field)) {
    if (field === "parsed_amount") {
      return (
        <span className="text-left tabular-nums">
          {rawValue ? formatMoney(rawValue, currencySymbol) : "—"}
        </span>
      );
    }
    return <span className="text-left">{rawValue || "—"}</span>;
  }

  const isAmount = field === "parsed_amount";

  return (
    <CellAutosaveInput
      autosave={autosave}
      formatDisplay={
        isAmount
          ? (v) => formatMoney(v, currencySymbol)
          : undefined
      }
      inputClassName={
        isAmount
          ? "h-8 min-w-[7rem] w-full text-left text-sm tabular-nums"
          : paymentEditableFieldInputClassName(
              field === "transaction_id"
                ? "transaction_id"
                : field === "remarks"
                  ? "remarks"
                  : "description",
            )
      }
      displayClassName={isAmount ? "tabular-nums" : undefined}
    />
  );
}

function emptyStubDraft(row: StudentPaymentAdminReportRow): StubDraft {
  return {
    parsedAmount: paymentFieldDisplayValue(row, "parsed_amount"),
    paymentMethodId:
      row.payment_method?.id != null ? String(row.payment_method.id) : "",
    transactionId: row.transaction_id ?? "",
    description: row.description ?? "",
    remarks: row.remarks ?? "",
    dateOnScreenshot: row.date_on_screenshot ?? "",
  };
}

export function StudentPaymentsResourceTable({
  rows,
  isLoading,
  isError,
  error,
  refetch,
  hideCourseColumn,
  monthDate,
  onOpenStudent,
  onViewScreenshot,
  onEditCoverage,
  onOpenAdjustments,
  tableUid,
}: StudentPaymentsResourceTableProps) {
  const { user } = useUser();
  const { tenant } = useTenant();
  const currencySymbol = useTenantCurrencySymbol();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const tableState = useResourceTableState({
    namespace: "student-payments-original",
    syncUrl: false,
    initial: { pageSize: 50 },
  });

  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [partsByGroupId, setPartsByGroupId] = useState<
    Record<number, StudentPaymentAdminReportRow[]>
  >({});
  const [stubDrafts, setStubDrafts] = useState<Record<string, StubDraft>>({});
  const stubCreateInFlight = useRef<Set<string>>(new Set());
  const [receiptLoadingId, setReceiptLoadingId] = useState<
    number | string | null
  >(null);

  const canVerify = Boolean(user && canVerifyPayments(user));
  const canRecord = Boolean(user && canRecordStudentPayments(user));
  const canViewScreenshots = Boolean(user && canViewPaymentScreenshots(user));
  const canManageRefunds = Boolean(user && canRecordRefunds(user));
  const canDownloadReceipt = Boolean(user && canDownloadPaymentReceipt(user));
  const tenantTimezone = tenant?.timezone?.trim() || "UTC";
  const paymentDateSaveTransform = useCallback(
    (date: Date) => {
      const ymd = formatInTimeZone(date, tenantTimezone, "yyyy-MM-dd");
      return getTenantDayBoundariesIso(tenantTimezone, ymd).startIso;
    },
    [tenantTimezone],
  );
  const userUploadStrategy =
    tenant?.transaction_screenshot_strategy ===
    TransactionScreenshotStrategy.user_upload;

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

  const q = tableState.q.trim().toLowerCase();
  const showRemainingAmount = useMemo(
    () =>
      rows.some(
        (row) => row.remaining_amount != null && row.remaining_amount !== "",
      ),
    [rows],
  );
  const filteredRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.user?.name,
        row.course?.title,
        row.transaction_id,
        row.description,
        row.remarks,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, q]);

  const rowsWithParts = useMemo(() => {
    return filteredRows.map((row) => {
      if (!isGroupPaymentRow(row)) return row;
      const gid = resolveGroupId(row);
      if (gid == null) return row;
      const override = partsByGroupId[gid];
      if (!override) return row;
      return { ...row, parts: override, part_count: override.length };
    });
  }, [filteredRows, partsByGroupId]);

  const flattened = useMemo(
    () => flattenPaymentReportRows(rowsWithParts, expandedGroupIds),
    [rowsWithParts, expandedGroupIds],
  );

  const pageFlat = useMemo(() => {
    const start = (tableState.page - 1) * tableState.pageSize;
    return flattened.slice(start, start + tableState.pageSize);
  }, [flattened, tableState.page, tableState.pageSize]);

  const pageRows: RowWithFlatMeta[] = useMemo(
    () =>
      pageFlat.map((f, i) => ({
        ...f.row,
        __flatKind: f.kind,
        __parentGroupId: f.parentGroupId,
        __partIndex: f.partIndex,
        __serial: (tableState.page - 1) * tableState.pageSize + i + 1,
      })),
    [pageFlat, tableState.page, tableState.pageSize],
  );

  const list: ResourceListResult<RowWithFlatMeta> = useMemo(
    () => ({
      rows: pageRows,
      total: flattened.length,
      isLoading,
      isError,
      error,
      refetch,
    }),
    [pageRows, flattened.length, isLoading, isError, error, refetch],
  );

  const navigateToUpload = useCallback(
    (row: StudentPaymentAdminReportRow) => {
      const qs = new URLSearchParams({
        courseId: String(row.course?.id ?? ""),
        userId: String(row.user?.id ?? ""),
        date: monthDate.toISOString(),
      });
      router.push(`/finances/student-payments/upload?${qs}`);
    },
    [monthDate, router],
  );

  const toggleGroup = useCallback(
    async (row: StudentPaymentAdminReportRow) => {
      const gid = resolveGroupId(row);
      if (gid == null) return;
      const willExpand = !expandedGroupIds.has(gid);
      setExpandedGroupIds((prev) => {
        const next = new Set(prev);
        if (next.has(gid)) next.delete(gid);
        else next.add(gid);
        return next;
      });
      if (
        willExpand &&
        (!row.parts || row.parts.length === 0) &&
        !partsByGroupId[gid]
      ) {
        try {
          const res = await makeGetRequest(`user-payment-groups/${gid}`);
          const payload = res as {
            data?: { data?: StudentPaymentAdminReportRow };
          };
          const data = payload?.data?.data ?? payload?.data;
          const parts = (data as StudentPaymentAdminReportRow | undefined)?.parts;
          if (Array.isArray(parts) && parts.length > 0) {
            setPartsByGroupId((prev) => ({ ...prev, [gid]: parts }));
          } else {
            toast.add({
              type: "error",
              description: "Could not load payment parts.",
            });
            setExpandedGroupIds((prev) => {
              const next = new Set(prev);
              next.delete(gid);
              return next;
            });
          }
        } catch {
          toast.add({
            type: "error",
            description: "Could not load payment parts.",
          });
          setExpandedGroupIds((prev) => {
            const next = new Set(prev);
            next.delete(gid);
            return next;
          });
        }
      }
    },
    [expandedGroupIds, partsByGroupId, toast],
  );

  const tryCreateStub = useCallback(
    async (row: StudentPaymentAdminReportRow, draft: StubDraft) => {
      const key = String(row.id);
      if (!canCreateSyntheticPaymentStub(draft)) return;
      if (stubCreateInFlight.current.has(key)) return;
      const userId = row.user?.id;
      const courseId = row.course?.id;
      if (userId == null || courseId == null) return;

      stubCreateInFlight.current.add(key);
      try {
        const bounds = getCalendarMonthUtcFilterBounds(monthDate);
        const fd = buildSyntheticPaymentStubFormData({
          userId: Number(userId),
          courseId: Number(courseId),
          createdById: user?.id,
          issuedAtIso: bounds.start.toISOString(),
          billingStartIso: bounds.start.toISOString(),
          billingEndIso: bounds.end.toISOString(),
          parsedAmount: draft.parsedAmount,
          paymentMethodId: draft.paymentMethodId,
          transactionId: draft.transactionId,
          description: draft.description,
          remarks: draft.remarks,
          dateOnScreenshot: draft.dateOnScreenshot,
        });
        await makePostRequest(
          "scan-transaction-screenshots",
          fd,
          {},
          { "Content-Type": "multipart/form-data" },
        );
        setStubDrafts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        await softRefetchStudentPaymentsReport(queryClient, { tableUid });
      } catch {
        toast.add({ type: "error", description: "Could not save change." });
      } finally {
        stubCreateInFlight.current.delete(key);
      }
    },
    [monthDate, queryClient, tableUid, toast, user?.id],
  );

  const updateStubField = useCallback(
    async (
      row: StudentPaymentAdminReportRow,
      field: keyof StubDraft,
      value: string,
    ) => {
      const key = String(row.id);
      const prev = stubDrafts[key] ?? emptyStubDraft(row);
      const next = { ...prev, [field]: value };
      setStubDrafts((d) => ({ ...d, [key]: next }));
      await tryCreateStub(row, next);
    },
    [stubDrafts, tryCreateStub],
  );

  const persistPaymentMethod = useCallback(
    async (row: RowWithFlatMeta, methodId: string) => {
      if (row.__flatKind === "group_parent" || isGroupPaymentRow(row)) return;
      if (isSyntheticPaymentRow(row)) {
        await updateStubField(row, "paymentMethodId", methodId);
        return;
      }
      try {
        await updateEntity(
          "user-payments",
          row.id,
          paymentFieldApiPayload("payment_method", methodId),
        );
        await softRefetchStudentPaymentsReport(queryClient, { tableUid });
      } catch {
        toast.add({
          type: "error",
          description: "Could not update payment account.",
        });
      }
    },
    [queryClient, tableUid, toast, updateStubField],
  );

  const copyPaymentColumn = useCallback(
    (field: "name" | "email") => {
      const slots = paymentStudentSlotsForCopy(pageRows);
      if (slots.length === 0) {
        toast.add({ description: "Nothing to copy" });
        return;
      }
      const values = slots.map((s) => (field === "name" ? s.name : s.email));
      const dedupedText = copyVisibleColumnValues(values, {
        dedupeKeys: slots.map((s) => s.userId),
      });
      const n = dedupedText === "" ? 0 : dedupedText.split("\n").length;
      void navigator.clipboard.writeText(dedupedText).then(
        () =>
          toast.add({
            description: `Copied ${n} ${field === "name" ? "names" : "emails"}`,
          }),
        () => toast.add({ description: "Could not copy to clipboard" }),
      );
    },
    [pageRows, toast],
  );

  const copyPaymentAmountColumn = useCallback(() => {
    const values = paymentAmountValuesForCopy(pageRows);
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
  }, [pageRows, toast]);

  const columns: Column<RowWithFlatMeta>[] = useMemo(() => {
    const cols: Column<RowWithFlatMeta>[] = [
      {
        id: "_serial",
        header: "No.",
        accessor: () => null,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.__flatKind === "group_part") {
            return <span className="text-muted-foreground"> </span>;
          }
          return <span>{row.__serial ?? "—"}</span>;
        },
      },
      {
        id: "user__name",
        header: "Student",
        accessor: (row) => row.user?.name,
        enableSorting: false,
        sizing: { role: "person" },
        headerMenu: {
          copy: true,
          onCopy: () => copyPaymentColumn("name"),
        },
        cell: ({ row }) => {
          if (row.__flatKind === "group_part") {
            return (
              <span className="pl-4 text-left text-sm text-muted-foreground">
                └ Part {(row.__partIndex ?? 0) + 1}
              </span>
            );
          }

          const name = row.user?.name ?? "—";
          const uid = row.user?.id;
          const gid = resolveGroupId(row);
          const isParent = row.__flatKind === "group_parent";
          const expanded = gid != null && expandedGroupIds.has(gid);
          const overlapWarning = Boolean(row.month_overlap_duplicate_coverage);
          const sharedNote = sharedScreenshotNote(row);
          const sharedNoteTitles = sharedScreenshotNoteTitles(row);
          const sharedTxnId = sharedTransactionLookupId(row);
          const sharedNoteHref =
            sharedNote && sharedTxnId
              ? transactionDuplicatesHref(sharedTxnId, pathname, searchParams)
              : null;

          const nameNode =
            uid == null ? (
              <span>{name}</span>
            ) : (
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => onOpenStudent(Number(uid))}
              >
                {name}
              </button>
            );

          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
              <div className="flex min-w-0 items-start gap-1">
                {isParent ? (
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 rounded p-0.5 hover:bg-muted"
                    aria-expanded={expanded}
                    aria-label={expanded ? "Collapse parts" : "Expand parts"}
                    onClick={() => void toggleGroup(row)}
                  >
                    {expanded ? (
                      <NavArrowDown className="size-4" aria-hidden />
                    ) : (
                      <NavArrowRight className="size-4" aria-hidden />
                    )}
                  </button>
                ) : null}
                {nameNode}
              </div>
              {overlapWarning ? (
                <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  Overlapping coverage
                </span>
              ) : null}
              {sharedNote ? (
                sharedNoteHref ? (
                  <Link
                    href={sharedNoteHref}
                    title={sharedNoteTitles ?? undefined}
                    className="max-w-full break-words text-xs font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
                  >
                    {sharedNote}
                  </Link>
                ) : (
                  <span
                    title={sharedNoteTitles ?? undefined}
                    className="max-w-full break-words text-xs font-medium text-amber-800 dark:text-amber-200"
                  >
                    {sharedNote}
                  </span>
                )
              ) : null}
            </div>
          );
        },
      },
      {
        id: "user__email",
        header: "Email",
        accessor: (row) => row.user?.email,
        enableSorting: false,
        sizing: { role: "prose" },
        headerMenu: {
          copy: true,
          onCopy: () => copyPaymentColumn("email"),
        },
        cell: ({ row, value }) => {
          if (row.__flatKind === "group_part") {
            return <span className="text-muted-foreground"> </span>;
          }
          return value == null || value === "" ? "—" : String(value);
        },
      },
    ];

    if (!hideCourseColumn) {
      cols.push({
        id: "course",
        header: "Course",
        accessor: (row) => row.course?.title,
        enableSorting: false,
        cell: ({ value }) => (
          <span className="text-left">{(value as string) || "—"}</span>
        ),
      });
    }

    const amountColumn: Column<RowWithFlatMeta> = {
      id: "parsed_amount",
      header: "Amount",
      accessor: (row) => paymentFieldDisplayValue(row, "parsed_amount"),
      enableSorting: false,
      headerMenu: {
        copy: true,
        onCopy: () => copyPaymentAmountColumn(),
      },
      cell: ({ row }) => {
        if (isGroupPaymentRow(row) && row.__flatKind !== "group_part") {
          const raw = paymentFieldDisplayValue(row, "parsed_amount");
          return (
            <span className="text-left tabular-nums">
              {raw ? formatMoney(raw, currencySymbol) : "—"}
            </span>
          );
        }
        const draft = stubDrafts[String(row.id)];
        const isSynthetic = isSyntheticPaymentRow(row);
        return (
          <PaymentEditableFieldCell
            row={row}
            field="parsed_amount"
            tableUid={tableUid}
            currencySymbol={currencySymbol}
            displayOverride={
              isSynthetic ? draft?.parsedAmount : undefined
            }
            onSyntheticChange={
              isSynthetic
                ? (next) => updateStubField(row, "parsedAmount", next)
                : undefined
            }
          />
        );
      },
    };

    const remainingAmountColumn: Column<RowWithFlatMeta> = {
      id: "remaining_amount",
      header: "Remaining amount",
      accessor: (row) => row.remaining_amount,
      enableSorting: false,
      cell: ({ row }) => {
        if (row.__flatKind === "group_part") {
          return <span className="text-left">—</span>;
        }
        const raw = row.remaining_amount;
        if (raw == null || raw === "") {
          return <span className="text-left">—</span>;
        }
        return (
          <span className="text-left tabular-nums">
            {formatMoney(String(raw), currencySymbol)}
          </span>
        );
      },
    };

    const statusColumn: Column<RowWithFlatMeta> = {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      enableSorting: false,
      cell: ({ row }) => {
        let statusNode: ReactNode;
        if (isDroppedEnrollmentRow(row)) {
          statusNode = (
            <span className="text-muted-foreground">Dropped</span>
          );
        } else if (syntheticAllowsInlineCreate(row)) {
          if (!canRecord || isExemptPaymentExpectationRow(row)) {
            statusNode = <span>—</span>;
          } else {
            statusNode = (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => navigateToUpload(row)}
              >
                Upload
              </Button>
            );
          }
        } else if (
          row.__flatKind === "group_parent" ||
          isGroupPaymentRow(row)
        ) {
          statusNode = <span>{row.status}</span>;
        } else {
          statusNode = (
            <UserPaymentStatusInlineForm
              userId={row.user?.id != null ? String(row.user.id) : ""}
              isDisabled={Boolean(user && !canVerifyPayments(user))}
              status={row.status as UserPaymentStatus}
              userPaymentId={row.id}
              tableUid={tableUid}
            />
          );
        }

        return (
          <div className="flex flex-col items-start gap-1 text-left">
            {statusNode}
            {paymentRowMissingScreenshot(row) &&
            row.__flatKind !== "group_parent" ? (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                No screenshot uploaded
              </p>
            ) : null}
          </div>
        );
      },
    };

    if (userUploadStrategy) {
      cols.push({
        id: "billing_start_date",
        header: "Billing Period",
        accessor: (row) => row.billing_start_date,
        enableSorting: false,
        cell: ({ row }) => {
          const display =
            row.billing_start_date && row.billing_end_date
              ? `${formatDate(row.billing_start_date)} - ${formatDate(row.billing_end_date)}`
              : row.issued_at
                ? formatDate(row.issued_at)
                : "—";
          return <span className="text-left">{display}</span>;
        },
      });
      if (canVerify) cols.push(amountColumn);
      if (showRemainingAmount) cols.push(remainingAmountColumn);
      cols.push(statusColumn);
    } else {
      if (canVerify) cols.push(amountColumn);
      if (showRemainingAmount) cols.push(remainingAmountColumn);
      cols.push(statusColumn);
      cols.push(
        {
          id: "payment_method__name",
          header: "Payment Account",
          accessor: (row) => row.payment_method?.name,
          enableSorting: false,
          sizing: { role: "control" },
          cell: ({ row }) => {
            if (row.__flatKind === "group_parent" || isGroupPaymentRow(row)) {
              return (
                <span className="text-left">
                  {row.payment_method?.name ?? "—"}
                </span>
              );
            }
            if (isExemptPaymentExpectationRow(row)) {
              return <span>—</span>;
            }
            const draft = stubDrafts[String(row.id)];
            const value = isSyntheticPaymentRow(row)
              ? draft?.paymentMethodId ||
                (row.payment_method?.id != null
                  ? String(row.payment_method.id)
                  : undefined)
              : row.payment_method?.id != null
                ? String(row.payment_method.id)
                : undefined;
            const disabled =
              row.status === UserPaymentStatus.verified ||
              paymentMethodsListQuery.isLoading;
            return (
              <Select
                className="w-full text-left"
                fullWidth
                items={paymentMethodOptions}
                value={value}
                placeholder="Select"
                disabled={disabled}
                onValueChange={(v) => {
                  void persistPaymentMethod(row, v);
                }}
              />
            );
          },
        },
        {
          id: "date_on_screenshot",
          header: "Date on Screenshot",
          accessor: (row) => row.date_on_screenshot,
          enableSorting: false,
          cell: ({ row }) => {
            if (row.__flatKind === "group_parent" || isGroupPaymentRow(row)) {
              return (
                <span className="text-left">
                  {row.date_on_screenshot
                    ? formatDate(String(row.date_on_screenshot))
                    : "—"}
                </span>
              );
            }
            const isSynthetic = isSyntheticPaymentRow(row);
            const draft = stubDrafts[String(row.id)];
            return (
              <PaymentEditableFieldCell
                row={row}
                field="date_on_screenshot"
                tableUid={tableUid}
                currencySymbol={currencySymbol}
                displayOverride={
                  isSynthetic ? draft?.dateOnScreenshot : undefined
                }
                onSyntheticChange={
                  isSynthetic
                    ? (next) => updateStubField(row, "dateOnScreenshot", next)
                    : undefined
                }
              />
            );
          },
        },
      );
    }

    cols.push(
      {
        id: "transaction_id",
        header: "Transaction ID",
        accessor: (row) => row.transaction_id ?? "",
        enableSorting: false,
        cell: ({ row }) => {
          const isSynthetic = isSyntheticPaymentRow(row);
          const draft = stubDrafts[String(row.id)];
          return (
            <PaymentEditableFieldCell
              row={row}
              field="transaction_id"
              tableUid={tableUid}
              currencySymbol={currencySymbol}
              displayOverride={isSynthetic ? draft?.transactionId : undefined}
              onSyntheticChange={
                isSynthetic
                  ? (next) => updateStubField(row, "transactionId", next)
                  : undefined
              }
            />
          );
        },
      },
      {
        id: "description",
        header: "Description",
        accessor: (row) => row.description ?? "",
        enableSorting: false,
        cell: ({ row }) => {
          const isSynthetic = isSyntheticPaymentRow(row);
          const draft = stubDrafts[String(row.id)];
          return (
            <PaymentEditableFieldCell
              row={row}
              field="description"
              tableUid={tableUid}
              currencySymbol={currencySymbol}
              displayOverride={isSynthetic ? draft?.description : undefined}
              onSyntheticChange={
                isSynthetic
                  ? (next) => updateStubField(row, "description", next)
                  : undefined
              }
            />
          );
        },
      },
      {
        id: "remarks",
        header: "Remarks",
        accessor: (row) => row.remarks ?? "",
        enableSorting: false,
        cell: ({ row }) => {
          const isSynthetic = isSyntheticPaymentRow(row);
          const draft = stubDrafts[String(row.id)];
          return (
            <PaymentEditableFieldCell
              row={row}
              field="remarks"
              tableUid={tableUid}
              currencySymbol={currencySymbol}
              displayOverride={isSynthetic ? draft?.remarks : undefined}
              onSyntheticChange={
                isSynthetic
                  ? (next) => updateStubField(row, "remarks", next)
                  : undefined
              }
            />
          );
        },
      },
      {
        id: "payment_date",
        header: "Payment date",
        accessor: (row) => resolveGroupPaymentDateDisplay(row),
        enableSorting: false,
        sizing: { role: "date" },
        cell: ({ row }) => {
          const isParent =
            row.__flatKind === "group_parent" || isGroupPaymentRow(row);
          const raw = resolveGroupPaymentDateDisplay(row);
          if (isParent || !isPaymentFieldEditable(row, "payment_date")) {
            return (
              <span className="text-left">{raw ? formatDate(raw) : "—"}</span>
            );
          }
          const paymentId = resolveUserPaymentId(row);
          if (paymentId == null) {
            return <span className="text-left">—</span>;
          }
          return (
            <InlineDatePicker
              value={row.payment_date}
              entityName="user-payments"
              entityId={paymentId}
              fieldName="payment_date"
              isDisabled={!canRecord}
              saveTransform={paymentDateSaveTransform}
              onSaved={() => {
                void softRefetchStudentPaymentsReport(queryClient, { tableUid });
              }}
            />
          );
        },
      },
      {
        id: "created_by",
        header: "Created By",
        accessor: (row) => paymentFieldDisplayValue(row, "created_by"),
        enableSorting: false,
        sizing: { role: "person" },
        cell: ({ row }) => {
          const value = paymentFieldDisplayValue(row, "created_by");
          return <span className="text-left">{value || "—"}</span>;
        },
      },
    );

    cols.push({
      id: "_actions",
      header: "Actions",
      accessor: () => "",
      enableSorting: false,
      cell: ({ row }) => {
        const screenshotUrl = getPaymentScreenshotUrl(row);
        const isParent =
          row.__flatKind === "group_parent" || isGroupPaymentRow(row);
        return (
          <div className="flex flex-col items-stretch gap-1">
            {canViewScreenshots && screenshotUrl ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 w-full justify-center active:scale-[0.98]"
                onClick={() => onViewScreenshot(screenshotUrl)}
              >
                <ImageIcon className="size-3.5" aria-hidden />
                View image
              </Button>
            ) : null}
            {canRecord &&
            !isExemptPaymentExpectationRow(row) &&
            (syntheticAllowsInlineCreate(row) || !screenshotUrl) ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 w-full justify-center active:scale-[0.98]"
                onClick={() => navigateToUpload(row)}
              >
                Upload
              </Button>
            ) : null}
            {!isSyntheticPaymentRow(row) && !isParent ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 w-full justify-center active:scale-[0.98]"
                onClick={() => onEditCoverage(row)}
              >
                Coverage
              </Button>
            ) : null}
            {canManageRefunds &&
            onOpenAdjustments &&
            resolveUserPaymentId(row) != null &&
            !isSyntheticPaymentRow(row) &&
            !isParent ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 w-full justify-center active:scale-[0.98]"
                onClick={() => onOpenAdjustments(row)}
              >
                Refunds
                {(row.adjustment_count ?? 0) > 0 ? (
                  <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {row.adjustment_count}
                  </span>
                ) : null}
              </Button>
            ) : null}
            {canDownloadReceipt &&
            tenant &&
            row.status === UserPaymentStatus.verified &&
            canShowPaymentReceiptAction(row, row.__flatKind) ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 w-full justify-center active:scale-[0.98]"
                isLoading={receiptLoadingId === row.id}
                disabled={receiptLoadingId === row.id}
                onClick={async () => {
                  setReceiptLoadingId(row.id);
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
                    setReceiptLoadingId(null);
                  }
                }}
              >
                Receipt
              </Button>
            ) : null}
            {canVerify &&
            !isSyntheticPaymentRow(row) &&
            isParent &&
            resolveGroupId(row) != null ? (
              <PaymentGroupDeleteButton
                groupId={resolveGroupId(row)!}
                tableUid={tableUid}
              />
            ) : null}
            {canVerify &&
            !isSyntheticPaymentRow(row) &&
            !isParent &&
            row.__flatKind !== "group_parent" ? (
              <PaymentRowDeleteButton
                userPaymentId={row.id}
                tableUid={tableUid}
              />
            ) : null}
          </div>
        );
      },
    });

    const layout = studentPaymentsResourceColumnLayout({
      hideCourseColumn,
      userUploadStrategy,
      canVerify,
      showRemainingAmount,
    });
    return applyColumnLayoutMeta(cols, layout);
  }, [
    filteredRows,
    hideCourseColumn,
    canVerify,
    showRemainingAmount,
    canRecord,
    canViewScreenshots,
    canManageRefunds,
    canDownloadReceipt,
    receiptLoadingId,
    userUploadStrategy,
    currencySymbol,
    tableUid,
    navigateToUpload,
    onOpenStudent,
    onViewScreenshot,
    onEditCoverage,
    onOpenAdjustments,
    tenant,
    toast,
    user,
    expandedGroupIds,
    toggleGroup,
    stubDrafts,
    updateStubField,
    persistPaymentMethod,
    paymentMethodOptions,
    paymentMethodsListQuery.isLoading,
    copyPaymentColumn,
    copyPaymentAmountColumn,
    paymentDateSaveTransform,
    pathname,
    searchParams,
  ]);

  return (
    <div className="min-w-0">
      <ResourceTable
        enableColumnResizing
        columnResizeStorageKey={tableUid}
        list={list}
        tableState={tableState}
        columns={columns}
        getRowId={(row) =>
          row.__flatKind === "group_part"
            ? `part-${row.__parentGroupId}-${row.id}`
            : String(row.id)
        }
      />
    </div>
  );
}
