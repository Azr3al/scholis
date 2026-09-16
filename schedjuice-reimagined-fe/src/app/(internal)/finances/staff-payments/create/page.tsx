"use client";

import { DatePicker } from "@/app/_chrome/date-picker";
import EntityCombobox from "@/components/form/entity-combobox";
import YearMonthSelector from "@/components/form/selectors/year-month-selector";
import FileDragAndDrop, {
  type extendedFileType,
  type localFileType,
} from "@/components/form/file-drag-and-drop";
import { PaymentScreenshotPreview } from "@/components/finances/payment-screenshot-preview";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import { STAFF_ROLE_FILTER } from "@/components/finances/payment-info-form-fields";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/primitives";
import {
  Button,
  Field,
  Input,
  Textarea,
  buttonVariants,
  useToast,
} from "@/components/primitives";
import { useFinancePageHeader } from "@/components/finances/record/use-finance-record-page-header";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";
import { useTenant } from "@/hooks/useTenant";
import { axiosClient } from "@/lib/api";
import {
  OCR_READ_ERROR_MESSAGE,
  PaymentScreenshotKind,
  type OcrPaymentScreenshotStatus,
  getFirstLocalImageFile,
  runPaymentScreenshotOcr,
} from "@/lib/finances/ocr-payment-screenshot";
import { crossfade } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";
import { usePaymentInfosList } from "@/sdk/hooks/payment-infos";
import { operatorEnum } from "@/types/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "iconoir-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

function isLocalFile(file: extendedFileType): file is localFileType {
  return "file" in file;
}

const StaffPaymentCreatePage = () => {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  const [staffId, setStaffId] = useState("");
  const [amount, setAmount] = useState("");
  const [payPeriodDate, setPayPeriodDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  });
  const [paidDate, setPaidDate] = useState<Date>(new Date());
  const [transactionId, setTransactionId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [files, setFiles] = useState<extendedFileType[]>([]);
  const [ocrStatus, setOcrStatus] =
    useState<OcrPaymentScreenshotStatus>("idle");
  const [ocrError, setOcrError] = useState<string | undefined>();
  const [duplicateWarningId, setDuplicateWarningId] = useState<number | null>(
    null,
  );
  const ocrRequestIdRef = useRef(0);

  const isOcrLoading = ocrStatus === "loading";

  const staffIdValid =
    staffId.trim() !== "" && isValidApiEntityIdParam(staffId);

  const defaultPaymentInfoList = usePaymentInfosList({
    enabled: staffIdValid,
    page: 1,
    pageSize: 1,
    sorts: [],
    q: "",
    fields: ["id", "account_name", "bank_type", "description", "is_default"],
    filterParams: [
      {
        field_name: "user_id",
        operator: operatorEnum.exact,
        value: staffId,
      },
      {
        field_name: "is_default",
        operator: operatorEnum.exact,
        value: "True",
      },
    ],
  });

  const defaultPaymentInfo = defaultPaymentInfoList.rows[0] ?? null;
  const payoutPanelLoading = staffIdValid && defaultPaymentInfoList.isLoading;
  const hasDefaultPayout = Boolean(defaultPaymentInfo);
  const proofFiles = files
    .filter((file): file is localFileType => isLocalFile(file))
    .map((file) => file.file);
  const firstVisibleProofFile = files.find(
    (file) => !("isRemoved" in file && file.isRemoved),
  );
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  const canSubmit =
    staffIdValid &&
    hasDefaultPayout &&
    amount.trim() !== "" &&
    Number(amount) > 0 &&
    proofFiles.length > 0 &&
    !isOcrLoading;

  const handleProofFilesChange = (nextFiles: extendedFileType[]) => {
    const firstImage = getFirstLocalImageFile(nextFiles);
    const requestId = ocrRequestIdRef.current + 1;
    ocrRequestIdRef.current = requestId;

    setFiles(nextFiles);

    if (!firstImage) {
      setOcrStatus("idle");
      setOcrError(undefined);
      setDuplicateWarningId(null);
      return;
    }

    setAmount("");
    setTransactionId("");
    setOcrStatus("loading");
    setOcrError(undefined);
    setDuplicateWarningId(null);

    void runPaymentScreenshotOcr({
      file: firstImage,
      paymentKind: PaymentScreenshotKind.Staff,
    })
      .then((result) => {
        if (ocrRequestIdRef.current !== requestId) return;
        setAmount(result.parsedAmount);
        setTransactionId(result.transactionId);
        setDuplicateWarningId(result.duplicateWarningId);
        setOcrStatus("success");
        setOcrError(undefined);
      })
      .catch(() => {
        if (ocrRequestIdRef.current !== requestId) return;
        setOcrStatus("error");
        setOcrError(OCR_READ_ERROR_MESSAGE);
        setDuplicateWarningId(null);
      });
  };

  const createPayment = useMutation({
    mutationFn: async () => {
      if (proofFiles.length === 0) {
        throw new Error("At least one proof file is required.");
      }
      const formData = new FormData();
      formData.append("user", String(Math.trunc(Number(staffId))));
      formData.append("amount", amount.trim());
      formData.append(
        "amount_currency",
        tenant?.currency_iso4217?.trim() || "MMK",
      );
      formData.append("paid_at", paidDate.toISOString());
      formData.append("pay_period_year", String(payPeriodDate.getFullYear()));
      formData.append("pay_period_month", String(payPeriodDate.getMonth() + 1));
      proofFiles.forEach((file, index) => {
        formData.append(`proof_${index}`, file);
      });
      if (transactionId.trim()) {
        formData.append("transaction_id", transactionId.trim());
      }
      if (remarks.trim()) {
        formData.append("remarks", remarks.trim());
      }
      return axiosClient.post("staff-payments", formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff-payments"] });
      toast.add({
        type: "success",
        description: "Staff payment recorded.",
      });
      router.push("/finances/staff-payments");
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not record payment.",
      });
    },
  });

  useFinancePageHeader();

  return (
    <PageContainer width="wide">
      <Link
        href="/finances/staff-payments"
        className="mb-6 inline-flex w-fit items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        Staff payments
      </Link>

      <motion.div
        variants={crossfade}
        initial="initial"
        animate="animate"
        className="mx-auto flex w-full max-w-xl flex-col gap-6"
      >
        <Field.Root className="w-full">
          <Field.Label>
            Staff member <span className="text-danger">*</span>
          </Field.Label>
          <EntityCombobox
            label=""
            entity="users"
            value={staffId || undefined}
            onChange={(value) => setStaffId(value ?? "")}
            displayFunction={(u) => `${u.name} (${u.email})`}
            comboboxPlaceholder="Search staff member…"
            queryParams={{
              fields: ["id", "name", "email"],
              sorts: ["name"],
              size: -1,
            }}
            filterParams={STAFF_ROLE_FILTER}
          />
        </Field.Root>
        <Field.Root className="w-full">
          <Field.Label>
            Payment proof <span className="text-danger">*</span>
          </Field.Label>
          <Field.Description className="text-sm text-text-muted">
            Put the bank transfer screenshot first. We read amount and reference
            from the first image only.
          </Field.Description>
          <div aria-busy={isOcrLoading || undefined}>
            <FileDragAndDrop
              label=""
              labelClassName="sr-only"
              files={files}
              setFiles={handleProofFilesChange}
              isMultiple
              maxFiles={5}
              excludeVideos
              showSelectedFiles
              showCarousel={false}
              isReadOnly={createPayment.isPending || isOcrLoading}
            />
            <PaymentScreenshotPreview
              file={firstVisibleProofFile}
              onView={setViewImageUrl}
            />
          </div>
          {isOcrLoading ? (
            <p className="mt-2 text-sm text-text-muted">Reading screenshot…</p>
          ) : ocrStatus === "error" ? (
            <p className="mt-2 text-sm text-text-muted" role="status">
              {ocrError ?? OCR_READ_ERROR_MESSAGE}
            </p>
          ) : null}
          {duplicateWarningId ? (
            <p className="mt-2 text-sm text-warning-foreground" role="status">
              This transaction may already be saved as staff payment #
              {duplicateWarningId}.
            </p>
          ) : null}
        </Field.Root>

        <div
          className="min-h-[7.5rem] rounded-lg border border-border bg-surface-elevated p-4"
          aria-busy={payoutPanelLoading}
        >
          <p className="text-sm font-medium text-text-secondary">
            Default payout account
          </p>
          {payoutPanelLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : !staffIdValid ? (
            <p className="mt-2 text-sm text-text-muted">
              Select a staff member to see where payment will be sent.
            </p>
          ) : hasDefaultPayout ? (
            <div className="mt-2 space-y-1 text-sm text-text-primary">
              <p>{defaultPaymentInfo?.account_name ?? "—"}</p>
              <p className="text-text-secondary">
                {defaultPaymentInfo?.bank_type ?? "—"}
                {defaultPaymentInfo?.description
                  ? ` · ${defaultPaymentInfo.description}`
                  : ""}
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-sm text-warning-foreground">
                This staff member has no default payout account.
              </p>
              <Link
                href={`/payment-infos/create?user_id=${encodeURIComponent(staffId)}`}
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                )}
              >
                Add payment info
              </Link>
            </div>
          )}
        </div>

        <Field.Root className="w-full">
          <Field.Label>
            Amount <span className="text-danger">*</span>
          </Field.Label>
          <Input
            type="number"
            min={0}
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            disabled={createPayment.isPending || isOcrLoading}
          />
        </Field.Root>

        <Field.Root className="w-full">
          <Field.Label>
            Pay period <span className="text-danger">*</span>
          </Field.Label>
          <YearMonthSelector
            date={payPeriodDate}
            setDate={(next) => setPayPeriodDate(next)}
          />
        </Field.Root>

        <Field.Root className="w-full">
          <Field.Label>
            Paid date <span className="text-danger">*</span>
          </Field.Label>
          <DatePicker
            date={paidDate}
            setDate={(next) => {
              if (next) setPaidDate(next);
            }}
            disabled={createPayment.isPending}
          />
        </Field.Root>

        <Field.Root className="w-full">
          <Field.Label>Reference</Field.Label>
          <Input
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            placeholder="Bank transaction ID"
            disabled={createPayment.isPending || isOcrLoading}
          />
        </Field.Root>

        <Field.Root className="w-full">
          <Field.Label>Remarks</Field.Label>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            disabled={createPayment.isPending}
          />
        </Field.Root>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            type="button"
            variant="primary"
            isLoading={createPayment.isPending}
            disabled={!canSubmit || createPayment.isPending}
            onClick={() => createPayment.mutate()}
          >
            Save
          </Button>
          <Link
            href="/finances/staff-payments"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              createPayment.isPending && "pointer-events-none opacity-50",
            )}
            aria-disabled={createPayment.isPending}
            tabIndex={createPayment.isPending ? -1 : undefined}
          >
            Cancel
          </Link>
        </div>
      </motion.div>
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Payment proof"
        onClose={() => setViewImageUrl(null)}
      />
    </PageContainer>
  );
};

export default StaffPaymentCreatePage;
