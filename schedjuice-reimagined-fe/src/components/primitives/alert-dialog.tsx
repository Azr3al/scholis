// src/components/primitives/alert-dialog.tsx
"use client";

import { type ComponentProps } from "react";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";
import { backdropClassName, popupClassName } from "./dialog";

function Title({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Title>) {
  return <BaseAlertDialog.Title className={cn("font-serif text-2xl", className)} {...props} />;
}

function Description({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Description>) {
  return (
    <BaseAlertDialog.Description className={cn("text-base text-text-secondary", className)} {...props} />
  );
}

function Popup({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Popup>) {
  return <BaseAlertDialog.Popup className={cn(popupClassName, "w-80", className)} {...props} />;
}

function Backdrop({ className, ...props }: ComponentProps<typeof BaseAlertDialog.Backdrop>) {
  return <BaseAlertDialog.Backdrop className={cn(backdropClassName, className)} {...props} />;
}

export const AlertDialog = {
  Root: BaseAlertDialog.Root,
  Trigger: BaseAlertDialog.Trigger,
  Portal: BaseAlertDialog.Portal,
  Close: BaseAlertDialog.Close,
  Backdrop,
  Popup,
  Title,
  Description,
};
