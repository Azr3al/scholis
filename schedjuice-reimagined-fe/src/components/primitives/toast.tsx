// src/components/primitives/toast.tsx
"use client";

import { type ReactNode } from "react";
import { Toast as BaseToast } from "@base-ui/react/toast";
import { Xmark } from "iconoir-react";
import { cn } from "@/lib/utils";
import { toastViewportClassName } from "@/lib/ui/overlay-classnames";

export const useToast = BaseToast.useToastManager;

function ToastList() {
  const { toasts } = BaseToast.useToastManager();
  return (
    <>
      {toasts.map((toast) => (
        <BaseToast.Root
          key={toast.id}
          toast={toast}
          className={cn(
            "absolute right-0 bottom-0 left-0 z-toast w-full",
            "rounded-md border border-border bg-surface-elevated text-text-primary",
            "shadow-[0_2px_8px_color-mix(in_srgb,var(--terminal)_10%,transparent),0_12px_28px_-6px_color-mix(in_srgb,var(--terminal)_16%,transparent)]",
            "[transform:translateY(calc(var(--toast-index)*-0.65rem))_scale(calc(max(0,1-(var(--toast-index)*0.05))))]",
            "transition-[transform,opacity] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
            "data-[starting-style]:translate-y-full data-[starting-style]:opacity-0",
            "data-[ending-style]:translate-y-full data-[ending-style]:opacity-0",
            "data-expanded:[transform:translateY(calc(var(--toast-offset-y)*-1))]",
          )}
        >
          <BaseToast.Content className="flex items-start gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <BaseToast.Title className="text-sm font-medium leading-snug text-text-primary" />
              <BaseToast.Description className="text-sm leading-relaxed text-text-secondary" />
            </div>
            <BaseToast.Close
              className="-mt-0.5 -mr-0.5 shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              aria-label="Dismiss"
            >
              <Xmark width={16} height={16} aria-hidden />
            </BaseToast.Close>
          </BaseToast.Content>
        </BaseToast.Root>
      ))}
    </>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className={toastViewportClassName}>
          <ToastList />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}
