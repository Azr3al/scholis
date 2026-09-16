"use client";

import { useCallback, useEffect, useRef } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { cn } from "@/lib/utils";

export function FeedTitleInput({
  registration,
  error,
  autoFocus,
  onEnter,
}: {
  registration: UseFormRegisterReturn;
  error?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const { ref: registerRef, ...registerRest } = registration;

  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      ref.current = el;
      registerRef(el);
    },
    [registerRef],
  );

  const autoGrow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [autoGrow]);

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
    }
  }, [autoFocus]);

  return (
    <div>
      <textarea
        {...registerRest}
        ref={setRef}
        rows={1}
        aria-label="Post title"
        placeholder="Title"
        onInput={autoGrow}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnter?.();
          }
        }}
        className={cn(
          "w-full resize-none overflow-hidden bg-transparent border-0 outline-none",
          "focus:ring-0 p-0 text-lg font-medium text-foreground",
          "placeholder:text-muted-foreground/60",
        )}
      />
      {error ? (
        <p className="text-sm text-destructive mt-0.5">{error}</p>
      ) : null}
    </div>
  );
}
