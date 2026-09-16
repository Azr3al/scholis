"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import {
  dropdownPositionerClassName,
  modalDropdownPositionerClassName,
} from "./overlay-classnames";

const ModalOverlayContext = createContext(false);

function ModalOverlayProvider({ children }: { children: ReactNode }) {
  return (
    <ModalOverlayContext.Provider value={true}>{children}</ModalOverlayContext.Provider>
  );
}

type ModalOverlayChildren = ComponentProps<typeof BaseDialog.Root>["children"];

export function wrapWithModalOverlay(
  children: ModalOverlayChildren | undefined,
): ModalOverlayChildren | undefined {
  if (children == null) {
    return children;
  }
  if (typeof children === "function") {
    const renderChild = children;
    const ModalOverlayRenderWrapper = (
      arg: Parameters<typeof renderChild>[0],
    ) => <ModalOverlayProvider>{renderChild(arg)}</ModalOverlayProvider>;
    ModalOverlayRenderWrapper.displayName = "ModalOverlayRenderWrapper";
    return ModalOverlayRenderWrapper;
  }
  return <ModalOverlayProvider>{children}</ModalOverlayProvider>;
}

function useInModalOverlay(): boolean {
  return useContext(ModalOverlayContext);
}

/** Popovers/selects portaled to `document.body` need modalDropdown when rendered inside a dialog/sheet. */
export function useDropdownPositionerClassName(className?: string): string {
  const inModal = useInModalOverlay();
  return cn(
    inModal ? modalDropdownPositionerClassName : dropdownPositionerClassName,
    className,
  );
}
