// src/components/primitives/sheet.tsx
"use client";

import { type ComponentProps } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { modalPopupClassName } from "@/lib/ui/overlay-classnames";
import { wrapWithModalOverlay } from "@/lib/ui/modal-overlay-context";
import { useRegisterGlobalOverlay } from "@/lib/ui/global-overlay-registry";
import { backdropClassName } from "./dialog";

type Side = "right" | "left" | "bottom";

const sideClasses: Record<Side, string> = {
  right:
    "inset-y-0 right-0 w-96 max-w-[calc(100vw-3rem)] border-l data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
  left:
    "inset-y-0 left-0 w-96 max-w-[calc(100vw-3rem)] border-r data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
  bottom:
    "inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-2xl border-t data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
};

function Popup({
  className,
  side = "right",
  ...props
}: ComponentProps<typeof BaseDialog.Popup> & { side?: Side }) {
  return (
    <BaseDialog.Popup
      className={cn(
        `${modalPopupClassName} fixed flex flex-col gap-4 border-border bg-surface-elevated p-6 text-text-primary shadow-lg`,
        "transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        sideClasses[side],
        className,
      )}
      {...props}
    />
  );
}

function Backdrop({ className, ...props }: ComponentProps<typeof BaseDialog.Backdrop>) {
  return <BaseDialog.Backdrop className={cn(backdropClassName, className)} {...props} />;
}

function Title({ className, ...props }: ComponentProps<typeof BaseDialog.Title>) {
  return <BaseDialog.Title className={cn("font-serif text-2xl", className)} {...props} />;
}

function Root({ open, children, ...props }: ComponentProps<typeof BaseDialog.Root>) {
  useRegisterGlobalOverlay(Boolean(open));
  return (
    <BaseDialog.Root open={open} {...props}>
      {wrapWithModalOverlay(children)}
    </BaseDialog.Root>
  );
}

export const Sheet = {
  Root,
  Trigger: BaseDialog.Trigger,
  Portal: BaseDialog.Portal,
  Close: BaseDialog.Close,
  Backdrop,
  Popup,
  Title,
  Description: BaseDialog.Description,
};
