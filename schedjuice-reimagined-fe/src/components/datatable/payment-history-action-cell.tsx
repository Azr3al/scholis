"use client";
import { Button, Dialog, useToast } from "@/components/primitives";

import { makePostRequest } from "@/app/client-api/utils";
import FileDragAndDrop, {
  extendedFileType,
} from "@/components/form/file-drag-and-drop";
import FullScreenImageViewer from "@/components/images/full-screen-image-viewer";
import {
  downloadReceiptForPaymentRow,
  notifyReceiptDownloadError,
  type PaymentReceiptRowInput,
} from "@/helpers/payment-receipt";
import { useTenant } from "@/hooks/useTenant";
import { useTenantCurrencySymbol } from "@/hooks/useTenantCurrencySymbol";
import { useUser } from "@/hooks/useUser";
import { invalidateUserPaymentsCaches } from "@/lib/finances/invalidate-user-payments-caches";
import { queryClient } from "@/lib/query";
import type { UserPayment } from "@/sdk";
import { UserPaymentStatus } from "@/types/finance";
import { useMutation } from "@tanstack/react-query";
import { Download, MediaImage as ImageIcon, Upload } from "iconoir-react";
import { useState } from "react";

type PaymentHistoryRowProps = {
  userPaymentId: number;
  screenshot: string | null | undefined;
  status: UserPaymentStatus;
};

function getReuploadDescription(status: UserPaymentStatus): string {
  switch (status) {
    case UserPaymentStatus.cannot_extract:
      return "We couldn't read your screenshot. Please upload a clearer image.";
    case UserPaymentStatus.duplicated:
      return "This receipt was already used. Upload a different transfer screenshot.";
    case UserPaymentStatus.amount_mismatch:
      return "The amount on your screenshot didn't match. Upload the correct receipt.";
    default:
      return "Replace your transfer screenshot if the previous upload was wrong. Your payment will be sent for verification again.";
  }
}

export function PaymentHistoryViewCell({
  screenshot,
}: Pick<PaymentHistoryRowProps, "screenshot">) {
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);

  if (!screenshot) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary" size="sm"
        className="h-8 gap-1.5 px-2.5"
        onClick={() => setViewImageUrl(screenshot)}
      >
        <ImageIcon className="size-3.5" aria-hidden />
        View
      </Button>
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Payment receipt"
        onClose={() => setViewImageUrl(null)}
      />
    </>
  );
}

export function PaymentHistoryReceiptDownloadCell({
  row,
}: {
  row: UserPayment;
}) {
  const toast = useToast();
  const { tenant } = useTenant();
  const { user } = useUser();
  const currencySymbol = useTenantCurrencySymbol();
  const [loading, setLoading] = useState(false);

  if (row.status !== UserPaymentStatus.verified || !tenant) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-8 gap-1.5 px-2.5"
      isLoading={loading}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await downloadReceiptForPaymentRow(
            row as PaymentReceiptRowInput,
            tenant,
            currencySymbol,
            user?.name ?? null,
          );
        } catch (err) {
          notifyReceiptDownloadError(toast, err);
        } finally {
          setLoading(false);
        }
      }}
    >
      <Download className="size-3.5" aria-hidden />
      PDF
    </Button>
  );
}

export function PaymentHistoryReuploadCell({
  userPaymentId,
  status,
}: Pick<PaymentHistoryRowProps, "userPaymentId" | "status">) {
  const toast = useToast();
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [files, setFiles] = useState<extendedFileType[]>([]);

  const canReupload = status !== UserPaymentStatus.verified;

  const reuploadMutation = useMutation({
    mutationKey: ["reuploadPaymentScreenshot", userPaymentId],
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("id", String(userPaymentId));
      formData.append("screenshot", file);
      return makePostRequest(
        "make-payment",
        formData,
        {},
        { "Content-Type": "multipart/form-data" },
      );
    },
    onSuccess: () => {
      toast.add({
        title: "Screenshot uploaded",
        description:
          "Your payment receipt was submitted. It will be reviewed shortly.",
      });
      setReuploadOpen(false);
      setFiles([]);
      void invalidateUserPaymentsCaches(queryClient);
    },
    onError: () => {
      toast.add({
        type: "error",
        title: "Upload failed",
        description: "Could not upload your screenshot. Please try again.",
      });
    },
  });

  const onReuploadSubmit = () => {
    if (files.length === 0 || !("file" in files[0])) {
      return;
    }
    reuploadMutation.mutate(files[0].file);
  };

  if (!canReupload) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary" size="sm"
        className="h-8 gap-1.5 px-2.5"
        onClick={() => setReuploadOpen(true)}
      >
        <Upload className="size-3.5" aria-hidden />
        Re-upload
      </Button>

      <Dialog.Root
        open={reuploadOpen}
        onOpenChange={(open) => {
          setReuploadOpen(open);
          if (!open) {
            setFiles([]);
          }
        }}
      >
        <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="flex max-h-[min(90vh,640px)] max-w-lg flex-col gap-0 p-0">
          <div className="shrink-0 space-y-1.5 border-b px-6 py-4">
            <Dialog.Title>Re-upload payment receipt</Dialog.Title>
            <Dialog.Description>
              {getReuploadDescription(status)}
            </Dialog.Description>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <FileDragAndDrop
              isMultiple={false}
              label="Upload screenshot"
              files={files}
              setFiles={setFiles}
              showCarousel={false}
            />
          </div>
          <div className="shrink-0 border-t bg-muted/30 px-6 py-4 sm:justify-end">
            <Button
              type="button"
              variant="secondary" onClick={() => setReuploadOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={reuploadMutation.isPending}
              disabled={files.length === 0}
              onClick={onReuploadSubmit}
            >
              Submit receipt
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
