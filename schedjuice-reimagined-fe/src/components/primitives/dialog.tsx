// src/components/primitives/dialog.tsx
"use client";

import { type ComponentProps } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import {
  modalBackdropClassName,
  modalPopupClassName,
} from "@/lib/ui/overlay-classnames";
import { wrapWithModalOverlay } from "@/lib/ui/modal-overlay-context";
import { useRegisterGlobalOverlay } from "@/lib/ui/global-overlay-registry";

export const backdropClassName = cn(
  modalBackdropClassName,
  "fixed inset-0 backdrop-blur-sm transition-opacity duration-[var(--duration-normal)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
);

export const popupClassName = cn(
  modalPopupClassName,
  "fixed top-1/2 left-1/2 flex w-[calc(100vw-2rem)] sm:max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-surface-elevated p-6 text-text-primary shadow-lg transition-[transform,opacity] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0",
);

function Title({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      className={cn("font-serif text-2xl", className)}
      {...props}
    />
  );
}

function Description({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      className={cn("text-base text-text-secondary", className)}
      {...props}
    />
  );
}

function Popup({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Popup className={cn(popupClassName, className)} {...props} />
  );
}

function Backdrop({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Backdrop>) {
  return (
    <BaseDialog.Backdrop
      className={cn(backdropClassName, className)}
      {...props}
    />
  );
}

function Root({ open, children, ...props }: ComponentProps<typeof BaseDialog.Root>) {
  useRegisterGlobalOverlay(Boolean(open));
  return (
    <BaseDialog.Root open={open} {...props}>
      {wrapWithModalOverlay(children)}
    </BaseDialog.Root>
  );
}

export const Dialog = {
  Root,
  Trigger: BaseDialog.Trigger,
  Portal: BaseDialog.Portal,
  Close: BaseDialog.Close,
  Backdrop,
  Popup,
  Title,
  Description,
};
