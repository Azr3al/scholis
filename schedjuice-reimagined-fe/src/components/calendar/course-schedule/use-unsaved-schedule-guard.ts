"use client";

import { useEffect } from "react";

export function useUnsavedScheduleGuard(
  isDirty: boolean,
  message = "You have unsaved schedule changes.",
) {
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, message]);
}

export function confirmDiscardScheduleChanges(): boolean {
  return window.confirm(
    "Discard unsaved schedule changes? Your draft will be lost.",
  );
}
