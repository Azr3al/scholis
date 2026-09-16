"use client";
import { Button, Dialog, buttonVariants } from "@/components/primitives";

import { useState } from "react";

interface HelpDialogProps {
  title?: string;
  content?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  children: React.ReactNode;
}

const ConfirmationDialog: React.FC<HelpDialogProps> = ({
  title = "Are you sure?",
  content="This action cannot be undone",
  onConfirm,
  isLoading,
  children,
}) => {
  const [open, setOpen] = useState(false)
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>{title}</Dialog.Title>
        </div>
        <p>{content}</p>
        <div className="space-x-3">
          <Button isLoading={isLoading} onClick={() => {
            onConfirm()
            setOpen(false)
          }}>
            Confirm
          </Button>
          <Dialog.Close render={<Button isLoading={isLoading} variant={"secondary"}>
              Close
            </Button>} />
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ConfirmationDialog;
