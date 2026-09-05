"use client";

import { useEffect } from "react";
import type { Control, FieldValues } from "react-hook-form";
import { useFormState } from "react-hook-form";

/**
 * Subscribes to dirty state in isolation so the parent does not re-render on every
 * form value change (unlike reading form.formState in the parent render).
 */
export function FormDirtyBeforeUnload({
  control,
}: {
  control: Control<FieldValues>;
}) {
  const { isDirty } = useFormState({ control });
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
  return null;
}
