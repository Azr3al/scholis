"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { Popover } from "@/components/primitives";

export type MatchAnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const ANCHOR_GAP = 4;

type Props = {
  variant: "radix" | "fixed";
  rect: MatchAnchorRect | null;
  open: boolean;
  onClose: () => void;
  overlayRef?: RefObject<HTMLDivElement | null>;
  popupClassName?: string;
  popupStyle?: React.CSSProperties;
  dataAttributes?: Record<string, boolean | string | undefined>;
  children: ReactNode;
};

export function AnchoredImportPopover({
  variant,
  rect,
  open,
  onClose,
  overlayRef,
  popupClassName,
  popupStyle,
  dataAttributes,
  children,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  const setOverlayNode = (node: HTMLDivElement | null) => {
    contentRef.current = node;
    if (overlayRef) {
      overlayRef.current = node;
    }
  };

  useEffect(() => {
    if (variant !== "fixed" || !open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (contentRef.current?.contains(event.target as Node)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, variant]);

  if (!open || !rect) return null;

  if (variant === "fixed") {
    // Callers pass overlayRef and position via useScrollAnchoredOverlayPosition.
    return (
      <div
        ref={setOverlayNode}
        {...dataAttributes}
        className={popupClassName}
        style={{
          position: "fixed",
          ...popupStyle,
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <Popover.Root
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Popover.Trigger
        render={
          <div
            style={{
              position: "fixed",
              left: rect.x,
              top: rect.y + rect.height,
              width: rect.width,
              height: 0,
            }}
          />
        }
      />
      <Popover.Portal>
        <Popover.Positioner align="start">
          <Popover.Popup className={popupClassName} style={popupStyle}>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
