"use client";

import { useEffect } from "react";
import type { FormSaveStatus } from "@/lib/autosave/autosave-core";

/**
 * Warns before unload while autosave is mid-flight or has unsaved errors.
 * Unlike a dirty-guard, a clean "saved"/"idle" state never blocks navigation.
 */
export function AutosaveUnloadGuard({ status }: { status: FormSaveStatus }) {
  const blocking = status === "saving" || status === "error";
  useEffect(() => {
    if (!blocking) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [blocking]);
  return null;
}
