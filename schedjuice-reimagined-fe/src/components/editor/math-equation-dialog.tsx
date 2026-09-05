"use client";
import { Button, Dialog, buttonVariants } from "@/components/primitives";

import type { Editor } from "@tiptap/react";
import type { MathfieldElement } from "mathlive";
import { normalizeMathliveKatexLatex } from "@/lib/normalizeMathliveKatexLatex";
import { useEffect, useRef, useState } from "react";
import "mathlive/static.css";

import { OVERLAY_LAYERS } from "@/lib/ui/overlay-layers";
const MATHLIVE_KEYBOARD_Z_INDEX = String(OVERLAY_LAYERS.emergency);

/** Portaled MathLive UI: keep Radix from treating these as "outside" the dialog. */
function isMathLiveOutsideDismissTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(".ML__keyboard") ||
      target.closest(".ui-menu-container") ||
      target.closest("#mathlive-suggestion-popover"),
  );
}

function hideMathLiveVirtualKeyboard() {
  if (typeof window === "undefined") return;
  const vk = window.mathVirtualKeyboard;
  if (vk?.visible) vk.hide({ animate: false });
}

type Props = {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLatex?: string;
  /** When set with `initialLatex`, runs `updateInlineMath` at this document position. */
  editPos?: number | null;
};

export function MathEquationDialog({
  editor,
  open,
  onOpenChange,
  initialLatex = "",
  editPos = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mfRef = useRef<MathfieldElement | null>(null);
  const [mathReady, setMathReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const key = "--keyboard-zindex";
    const previous = root.style.getPropertyValue(key);
    root.style.setProperty(key, MATHLIVE_KEYBOARD_Z_INDEX);
    return () => {
      if (previous) root.style.setProperty(key, previous);
      else root.style.removeProperty(key);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      hideMathLiveVirtualKeyboard();
      setMathReady(false);
      mfRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
      return;
    }
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void import("mathlive").then(({ MathfieldElement }) => {
        if (cancelled || !hostRef.current) return;
        const el = new MathfieldElement();
        /** Avoid the global full-viewport keyboard popping up on every focus (`auto`). */
        el.mathVirtualKeyboardPolicy = "manual";
        el.style.setProperty("--keyboard-zindex", MATHLIVE_KEYBOARD_Z_INDEX);
        el.className =
          "w-full min-h-[min(40vh,320px)] rounded-md border border-border bg-background text-lg";
        hostRef.current.innerHTML = "";
        hostRef.current.appendChild(el);
        mfRef.current = el;
        el.setValue(initialLatex || "", { silenceNotifications: true });
        setMathReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      hideMathLiveVirtualKeyboard();
      mfRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [open, initialLatex]);

  const handleInsert = () => {
    const el = mfRef.current;
    if (!el) return;
    const latex = normalizeMathliveKatexLatex(el.getValue("latex-unstyled"));
    if (!latex) return;
    if (editPos != null) {
      editor.chain().focus().updateInlineMath({ latex, pos: editPos }).run();
    } else {
      editor.chain().focus().insertInlineMath({ latex }).run();
    }
    hideMathLiveVirtualKeyboard();
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, eventDetails) => {
        if (
          !next &&
          eventDetails.reason === "outside-press" &&
          isMathLiveOutsideDismissTarget(eventDetails.event.target)
        ) {
          eventDetails.cancel();
          return;
        }
        if (!next) hideMathLiveVirtualKeyboard();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup
        className="flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-6 overflow-y-auto sm:w-full"
      >
        <div>
          <Dialog.Title>
            {editPos != null ? "Edit equation" : "Insert equation"}
          </Dialog.Title>
        </div>
        <div
          ref={hostRef}
          className={
            mathReady
              ? "min-h-[min(40vh,320px)] w-full"
              : "min-h-[min(40vh,320px)] w-full animate-pulse rounded-md bg-muted"
          }
        />
        <div className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="secondary" onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleInsert}>
            {editPos != null ? "Update" : "Insert"}
          </Button>
        </div>
      </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
