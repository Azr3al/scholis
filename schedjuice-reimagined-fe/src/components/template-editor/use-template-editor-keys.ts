"use client";

import { isDeleteLayerKey, isEditorTypingTarget } from "@/lib/image-template/layer-stack";
import { useEffect, useRef } from "react";

export function useTemplateEditorKeys(args: {
  onSave: () => void;
  selectedId: string | "page" | null;
  onEscape: () => void;
  onUndo: () => void;
  onDeleteSelected: () => void;
}) {
  const argsRef = useRef(args);
  argsRef.current = args;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        argsRef.current.onSave();
        return;
      }
      if (isEditorTypingTarget(event)) return;
      if (event.key === "Escape") {
        argsRef.current.onEscape();
        return;
      }
      if (isDeleteLayerKey(event)) {
        const id = argsRef.current.selectedId;
        if (!id || id === "page") return;
        event.preventDefault();
        argsRef.current.onDeleteSelected();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault();
        argsRef.current.onUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
