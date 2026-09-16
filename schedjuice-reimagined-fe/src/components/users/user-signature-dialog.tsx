"use client";

import { useEffect, useRef, useState } from "react";
import { Button, useToast } from "@/components/primitives";
import { Dialog } from "@/components/primitives/dialog";
import { useUserSignatureUpload } from "@/hooks/use-user-signature-upload";
import {
  UserSignaturePad,
  type UserSignaturePadHandle,
} from "@/components/users/user-signature-pad";

export function UserSignatureDialog({
  open,
  onOpenChange,
  userId,
  queryKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  queryKey: unknown[];
}) {
  const toast = useToast();
  const padRef = useRef<UserSignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const { uploadSignature, busy } = useUserSignatureUpload({ userId, queryKey });

  const refreshEmpty = () => setEmpty(padRef.current?.isEmpty() ?? true);

  useEffect(() => {
    if (!open) {
      setEmpty(true);
    }
  }, [open]);

  const handleSave = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    try {
      await uploadSignature(padRef.current.toPngDataUrl());
      onOpenChange(false);
    } catch {
      toast.add({
        title: "Could not save signature",
        description: "Please try again later if the problem persists.",
      });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="max-w-xl">
          <Dialog.Title>Draw your signature</Dialog.Title>
          <Dialog.Description>Sign in the box below</Dialog.Description>

          <div className="mt-4 rounded-md border border-border bg-background p-2">
            <UserSignaturePad
              ref={padRef}
              className="h-[200px] w-full touch-none"
              onStrokeEnd={refreshEmpty}
            />
          </div>

          <div className="mt-4 flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                padRef.current?.clear();
                refreshEmpty();
              }}
            >
              Clear pad
            </Button>
            <div className="flex gap-2">
              <Dialog.Close render={<Button type="button" variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button
                type="button"
                disabled={busy || empty}
                onClick={() => void handleSave()}
              >
                Save
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
