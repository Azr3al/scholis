"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { AnimatePresence, motion } from "motion/react";
import { Check, EditPencil } from "iconoir-react";
import type { FieldSaveState } from "@/lib/autosave/autosave-core";
import { isUndoVisible } from "@/components/record/inline/undo-core";
import { useUndo } from "@/components/record/inline/use-undo";
import { savedTick } from "@/lib/sj/motion";
import { cn } from "@/lib/utils";

type Props = {
  form: UseFormReturn<any>;
  name: string;
  status?: FieldSaveState;
  bindField: (name: string) => { onBlur: () => void };
  commitField: (name: string) => void;
  canEdit: boolean;
  multiline?: boolean;
  placeholder?: string;
  displayClassName?: string;
  inputClassName?: string;
};

/**
 * Course hub inline text with autosave / undo chrome.
 *
 * Single-line entity titles on **new** surfaces should use `InlineEntityTitle`
 * (DESIGN.md §9.1). This component remains the course-record autosave wrapper
 * until it is refactored to compose that control.
 */
export function CourseRecordInlineText({
  form,
  name,
  status,
  bindField,
  commitField,
  canEdit,
  multiline = false,
  placeholder = "—",
  displayClassName,
  inputClassName,
}: Props) {
  const [editing, setEditing] = useState(false);
  const undo = useUndo();
  const value = (form.watch(name) as string | undefined) ?? "";
  const error = form.formState.errors[name]?.message as string | undefined;
  const fieldBind = bindField(name);

  if (!canEdit) {
    if (multiline) {
      return (
        <p
          className={cn(
            "max-w-3xl text-pretty text-sm leading-relaxed text-text-muted",
            displayClassName,
          )}
        >
          {value || placeholder}
        </p>
      );
    }
    return (
      <p className={cn("text-text-primary", displayClassName)}>
        {value || placeholder}
      </p>
    );
  }

  function startEdit() {
    undo.clear();
    setEditing(true);
  }

  function finishEdit() {
    const prev = form.formState.defaultValues?.[name];
    fieldBind.onBlur();
    setEditing(false);
    if (!form.getFieldState(name).invalid && form.getValues(name) !== prev) {
      undo.offer(name, prev);
    }
  }

  function doUndo() {
    if (!undo.entry) return;
    form.setValue(name, undo.entry.previousValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
    commitField(name);
    undo.clear();
  }

  const statusIndicator = (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      <AnimatePresence mode="popLayout">
        {isUndoVisible(undo.entry) ? (
          <motion.span
            key="saved-undo"
            layout
            variants={savedTick}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex items-center gap-1.5 motion-reduce:transition-none"
          >
            <span className="flex items-center gap-1 text-success">
              <Check width={13} height={13} aria-hidden /> Saved
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                doUndo();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  doUndo();
                }
              }}
              className="text-accent underline-offset-2 hover:underline"
            >
              Undo
            </span>
          </motion.span>
        ) : status === "saving" ? (
          <motion.span
            key="saving"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="text-text-muted motion-reduce:transition-none"
          >
            Saving…
          </motion.span>
        ) : status === "error" ? (
          <motion.span
            key="error"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="text-danger motion-reduce:transition-none"
          >
            Retry
          </motion.span>
        ) : null}
      </AnimatePresence>
      <EditPencil
        width={14}
        height={14}
        className="text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </span>
  );

  if (editing) {
    const sharedClass = cn(
      "w-full max-w-3xl rounded-md border bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none",
      "focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
      error ? "border-danger" : "border-border-strong",
      inputClassName,
    );

    return (
      <div className="w-full max-w-3xl">
        {multiline ? (
          <textarea
            {...form.register(name)}
            rows={3}
            autoFocus
            placeholder={placeholder}
            onBlur={finishEdit}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            aria-invalid={Boolean(error)}
            className={sharedClass}
          />
        ) : (
          <input
            {...form.register(name)}
            type="text"
            autoFocus
            placeholder={placeholder}
            onBlur={finishEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-invalid={Boolean(error)}
            className={sharedClass}
          />
        )}
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className={cn(
        "group flex w-full max-w-3xl items-start justify-between gap-3 rounded-md text-left hover:bg-surface-hover",
        multiline ? "px-1 py-1" : "px-1 py-0.5",
      )}
    >
      {multiline ? (
        <span
          className={cn(
            "text-pretty text-sm leading-relaxed text-text-muted",
            displayClassName,
          )}
        >
          {value || <span className="text-text-muted">{placeholder}</span>}
        </span>
      ) : (
        <span className={cn("min-w-0 truncate text-text-primary", displayClassName)}>
          {value || <span className="text-text-muted">{placeholder}</span>}
        </span>
      )}
      {statusIndicator}
    </button>
  );
}
