"use client";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { AnimatePresence, motion } from "motion/react";
import { Check, EditPencil, Lock } from "iconoir-react";
import { savedTick } from "@/lib/sj/motion";
import type { FieldSaveState } from "@/lib/autosave/autosave-core";
import { isUndoVisible } from "./undo-core";
import { useUndo } from "./use-undo";
import { cn } from "@/lib/utils";

type Props = {
  form: UseFormReturn<any>;
  name: string;
  label: string;
  type?: "text" | "email" | "tel";
  status?: FieldSaveState;
  bindField: (name: string) => { onBlur: () => void };
  commitField: (name: string) => void;
  locked?: boolean;
  lockedHint?: string;
  placeholder?: string;
};

export function InlineField({
  form,
  name,
  label,
  type = "text",
  status,
  bindField,
  commitField,
  locked,
  lockedHint = "Managed elsewhere",
  placeholder,
}: Props) {
  const [editing, setEditing] = useState(false);
  const undo = useUndo();
  const value = form.watch(name) as string | undefined;
  const error = form.formState.errors[name]?.message as string | undefined;
  const fieldBind = bindField(name);

  if (locked) {
    return (
      <Row label={label}>
        <div className="flex flex-1 items-center justify-between px-2.5 py-1.5 text-sm text-text-secondary">
          <span className="truncate">{value || "—"}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted">
            <Lock width={12} height={12} aria-hidden /> {lockedHint}
          </span>
        </div>
      </Row>
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

  return (
    <Row label={label}>
      {editing ? (
        <div className="flex-1">
          <input
            {...form.register(name)}
            type={type}
            autoFocus
            placeholder={placeholder}
            onBlur={finishEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-invalid={Boolean(error)}
            className={cn(
              "w-full rounded-md border bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none",
              "focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
              error ? "border-danger" : "border-border-strong",
            )}
          />
          {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="group flex flex-1 items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        >
          <span className="truncate">
            {value || <span className="text-text-muted">{placeholder ?? "—"}</span>}
          </span>
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
        </button>
      )}
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="w-36 shrink-0 text-sm text-text-muted">{label}</span>
      {children}
    </div>
  );
}
