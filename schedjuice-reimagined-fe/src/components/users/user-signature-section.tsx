"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertDialog, Button } from "@/components/primitives";
import { RecordSection } from "@/components/record/record-section";
import { canEditUserSignature } from "@/helpers/authorization";
import { useUserSignatureUpload } from "@/hooks/use-user-signature-upload";
import { cn } from "@/lib/utils";
import type { accountType } from "@/types/user";
import { UserSignatureDialog } from "./user-signature-dialog";

const CHECKERBOARD =
  "bg-[linear-gradient(45deg,#e5e5e5_25%,transparent_25%),linear-gradient(-45deg,#e5e5e5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e5e5_75%),linear-gradient(-45deg,transparent_75%,#e5e5e5_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]";

export function UserSignatureSection({
  subject,
  viewer,
  recordQueryKey,
}: {
  subject: accountType;
  viewer: accountType;
  recordQueryKey: unknown[];
}) {
  const canEdit = canEditUserSignature(viewer, subject);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const { clearSignature, busy } = useUserSignatureUpload({
    userId: subject.id,
    queryKey: recordQueryKey,
  });
  const url = subject.user_signature_url ?? null;

  const handleClear = async () => {
    await clearSignature();
    setConfirmClearOpen(false);
  };

  return (
    <RecordSection title="Signature">
      <div
        className={cn(
          "relative flex min-h-[120px] max-w-md items-center justify-center rounded-md border border-border p-4",
          url ? CHECKERBOARD : "bg-muted/30",
        )}
      >
        {url ? (
          <Image
            src={url}
            alt={`${subject.name ?? "User"} signature`}
            width={480}
            height={172}
            className="max-h-28 w-auto object-contain"
            unoptimized
          />
        ) : (
          <p className="text-sm text-muted-foreground">No signature</p>
        )}
      </div>

      {canEdit ? (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDialogOpen(true)}
          >
            Draw signature
          </Button>
          {url ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmClearOpen(true)}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      <UserSignatureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={subject.id}
        queryKey={recordQueryKey}
      />

      <AlertDialog.Root open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop />
          <AlertDialog.Popup>
            <AlertDialog.Title>Remove signature?</AlertDialog.Title>
            <AlertDialog.Description>
              Your saved signature will be removed from your profile.
            </AlertDialog.Description>
            <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
              Cancel
            </AlertDialog.Close>
            <AlertDialog.Close
              render={
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void handleClear()}
                />
              }
            >
              Remove
            </AlertDialog.Close>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </RecordSection>
  );
}
