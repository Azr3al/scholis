"use client";

import { EditPencil } from "iconoir-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type InlineEntityTitleProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  /** Accessible name for the resting control and the input. */
  "aria-label"?: string;
};

/**
 * Course-title style inline edit (docs/design/ui-contracts/entity-title-chrome.md).
 * Resting: serif display text + muted placeholder. Click → autofocus input.
 */
export function InlineEntityTitle({
  value,
  onChange,
  placeholder = "Untitled",
  className,
  displayClassName,
  inputClassName,
  "aria-label": ariaLabel = "Title",
}: InlineEntityTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelingRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function startEdit() {
    cancelingRef.current = false;
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    if (cancelingRef.current) {
      cancelingRef.current = false;
      return;
    }
    onChange(draft);
    setEditing(false);
  }

  function cancel() {
    cancelingRef.current = true;
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={cn(
          "w-full max-w-3xl rounded-md border border-border-strong bg-surface px-2.5 py-1.5 font-serif text-2xl text-text-primary outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
          inputClassName,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={`Edit ${ariaLabel.toLowerCase()}`}
      className={cn(
        "group flex w-full max-w-3xl items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left hover:bg-surface-hover",
        className,
      )}
    >
      <span
        className={cn(
          "min-w-0 truncate font-serif text-2xl text-text-primary",
          displayClassName,
        )}
      >
        {value ? (
          value
        ) : (
          <span className="text-text-muted">{placeholder}</span>
        )}
      </span>
      <EditPencil
        width={14}
        height={14}
        className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}
