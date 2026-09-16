"use client";

import {
  Button,
  Field,
  Input,
  Select,
  Sheet,
  useToast,
} from "@/components/primitives";
import { TableSkeleton } from "@/components/loading/structured-skeletons";
import FileDragAndDrop, {
  type extendedFileType,
  type localFileType,
} from "@/components/form/file-drag-and-drop";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import { snakeToTitle } from "@/helpers/formatters";
import {
  type PaymentAdjustment,
  type PaymentAdjustmentKind,
  usePaymentAdjustments,
} from "@/hooks/finances/use-payment-adjustments";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { cn } from "@/lib/utils";
import { MediaImage as ImageIcon, Trash as TrashIcon } from "iconoir-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const KIND_OPTIONS: { value: PaymentAdjustmentKind; label: string }[] = [
  { value: "refund", label: "Refund" },
  { value: "re_transfer", label: "Re-transfer" },
];

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function AdjustmentCard({
  adjustment,
  currencySymbol,
  canDelete,
  onViewImage,
  onDelete,
  isDeleting,
}: {
  adjustment: PaymentAdjustment;
  currencySymbol: string;
  canDelete: boolean;
  onViewImage: (url: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-primary">
            {snakeToTitle(adjustment.kind)}
          </p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">
            {formatMoney(String(adjustment.amount), currencySymbol)}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{formatDate(adjustment.occurred_at)}</p>
          {adjustment.created_by_name ? (
            <p className="mt-0.5">by {adjustment.created_by_name}</p>
          ) : null}
        </div>
      </div>

      {adjustment.note ? (
        <p className="mt-3 text-sm text-muted-foreground">{adjustment.note}</p>
      ) : null}

      {adjustment.images.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {adjustment.images.map((image) =>
            image.image_url ? (
              <button
                key={image.id}
                type="button"
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted/30 transition-transform active:scale-[0.98]"
                onClick={() => onViewImage(image.image_url!)}
                aria-label={`View ${image.filename}`}
              >
                <Image
                  src={image.image_url}
                  alt={image.filename}
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized
                />
              </button>
            ) : null,
          )}
        </div>
      ) : null}

      {canDelete ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3 h-8 text-destructive active:scale-[0.98]"
          disabled={isDeleting}
          onClick={onDelete}
        >
          <TrashIcon className="mr-1.5 size-4" aria-hidden />
          Remove
        </Button>
      ) : null}
    </div>
  );
}

export function PaymentAdjustmentsDrawer({
  paymentRow,
  tableUid,
  onClose,
  onViewImage,
  canManage,
}: {
  paymentRow: StudentPaymentAdminReportRow | null;
  tableUid?: string;
  onClose: () => void;
  onViewImage: (url: string) => void;
  canManage: boolean;
}) {
  const open = paymentRow != null;
  const paymentId = typeof paymentRow?.id === "number" ? paymentRow.id : null;
  const currencySymbol = useTenantCurrencySymbol();
  const toast = useToast();
  const { listQuery, createMutation, deleteMutation } = usePaymentAdjustments(
    paymentId,
    { tableUid },
  );

  const [kind, setKind] = useState<PaymentAdjustmentKind>("refund");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<extendedFileType[]>([]);

  useEffect(() => {
    if (!open) return;
    setKind("refund");
    setAmount("");
    setOccurredAt(toDatetimeLocalValue(new Date()));
    setNote("");
    setFiles([]);
  }, [open, paymentId]);

  const studentLabel = paymentRow?.user?.name ?? "Student";
  const courseLabel = paymentRow?.course?.title ?? "Course";
  const adjustmentCount = paymentRow?.adjustment_count ?? 0;

  const canSubmit = useMemo(
    () =>
      Boolean(
        canManage &&
          paymentId &&
          amount.trim() &&
          occurredAt &&
          files.length > 0 &&
          !createMutation.isPending,
      ),
    [canManage, paymentId, amount, occurredAt, files.length, createMutation.isPending],
  );

  const handleSubmit = async () => {
    if (!canSubmit || paymentId == null) return;
    try {
      await createMutation.mutateAsync({
        kind,
        amount: amount.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
        note,
        files: files
          .filter((file): file is localFileType => "file" in file)
          .map((file) => file.file),
      });
      toast.add({ description: "Refund / re-transfer recorded." });
      setAmount("");
      setNote("");
      setFiles([]);
    } catch {
      toast.add({
        type: "error",
        title: "Could not save",
        description: "Check the form and try again.",
      });
    }
  };

  return (
    <Sheet.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Sheet.Portal>
        <Sheet.Backdrop />
        <Sheet.Popup
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[720px] lg:w-[820px]"
        >
          <div className="space-y-1 border-b border-border px-6 py-5 pr-12 text-left">
            <Sheet.Title className="text-lg font-semibold text-text-primary">
              Refunds & re-transfers
            </Sheet.Title>
            <Sheet.Description className="text-xs text-muted-foreground">
              {studentLabel} · {courseLabel}
              {adjustmentCount > 0 ? ` · ${adjustmentCount} recorded` : ""}
            </Sheet.Description>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-text-primary">
                Recorded entries
              </h3>
              {!paymentId || listQuery.isLoading ? (
                <TableSkeleton columns={2} rows={3} />
              ) : listQuery.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  Failed to load entries.
                </p>
              ) : (listQuery.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No refund or re-transfer proof has been attached yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {listQuery.data?.map((adjustment) => (
                    <AdjustmentCard
                      key={adjustment.id}
                      adjustment={adjustment}
                      currencySymbol={currencySymbol}
                      canDelete={canManage}
                      onViewImage={onViewImage}
                      isDeleting={deleteMutation.isPending}
                      onDelete={() => deleteMutation.mutate(adjustment.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {canManage ? (
              <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
                <h3 className="text-sm font-medium text-text-primary">
                  Add proof
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field.Root>
                    <Field.Label>Type</Field.Label>
                    <Select
                      items={KIND_OPTIONS}
                      value={kind}
                      size="full"
                      onValueChange={(value) =>
                        setKind(value as PaymentAdjustmentKind)
                      }
                    />
                  </Field.Root>

                  <Field.Root>
                    <Field.Label>Amount</Field.Label>
                    <Input
                      className="h-10 font-mono tabular-nums"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field.Root>

                  <Field.Root className="sm:col-span-2">
                    <Field.Label>Date</Field.Label>
                    <Input
                      className="h-10"
                      type="datetime-local"
                      value={occurredAt}
                      onChange={(e) => setOccurredAt(e.target.value)}
                    />
                  </Field.Root>

                  <Field.Root className="sm:col-span-2">
                    <Field.Label>Note</Field.Label>
                    <Input
                      className="h-10"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional context for finance staff"
                    />
                  </Field.Root>
                </div>

                <Field.Root>
                  <Field.Label>Screenshots</Field.Label>
                  <FileDragAndDrop
                    className="w-full min-w-0"
                    label=""
                    files={files}
                    setFiles={setFiles}
                    maxFiles={5}
                    showCarousel={false}
                  />
                </Field.Root>

                <Button
                  type="button"
                  variant="primary"
                  className={cn("h-10 active:scale-[0.98]")}
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit()}
                >
                  <ImageIcon className="mr-1.5 size-4" aria-hidden />
                  Save entry
                </Button>
              </section>
            ) : null}
          </div>
        </Sheet.Popup>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
