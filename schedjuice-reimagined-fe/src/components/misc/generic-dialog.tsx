"use client";
import { Button, Dialog, buttonVariants } from "@/components/primitives";
import type { ReactElement, ReactNode } from "react";

interface GenericDialogProps {
  title: string;
  content: ReactNode;
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  isLoading?: boolean;
}

const GenericDialog: React.FC<GenericDialogProps> = ({
  title,
  content,
  trigger,
  open,
  onOpenChange,
  onConfirm,
  confirmLabel = "Confirm",
  isLoading,
}) => {
  const isControlled = open !== undefined && onOpenChange !== undefined;

  return (
    <Dialog.Root
      open={isControlled ? open : undefined}
      onOpenChange={isControlled ? onOpenChange : undefined}
    >
      {trigger && <Dialog.Trigger render={trigger} />}
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
        <div>
          <Dialog.Title>{title}</Dialog.Title>
        </div>
        {content}
        <div>
          <Dialog.Close render={<Button variant="secondary" isLoading={isLoading}>
              Close
            </Button>} />
          {onConfirm && (
            <Button onClick={onConfirm} isLoading={isLoading}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default GenericDialog;
