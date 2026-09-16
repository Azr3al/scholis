"use client";

import { cn } from "@/lib/utils";
import React, { forwardRef, useImperativeHandle, useRef } from "react";

export type ContentEditableHandle = {
  element: HTMLDivElement | null;
  getText: () => string;
  insertText: (text: string) => void;
  /** Replace all content (plain text). */
  setPlainText: (text: string) => void;
  clear: () => void;
  focus: () => void;
};

type CEProps = {
  placeholder?: string;
  className?: string;
  onSubmit?: (value: string) => void;
  /** Fires on each input event (e.g. debounced typing indicators). */
  onContentChange?: () => void;
  /** Runs before built-in Enter-to-send handling; call preventDefault to block send. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** For caret moves (e.g. arrows) without an input event. */
  onKeyUp?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Clipboard paste on the contenteditable (e.g. images / files). */
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  maxHeight?: number;
};

const ContentEditableInput = forwardRef<ContentEditableHandle, CEProps>(
  (
    {
      placeholder,
      className,
      onSubmit,
      onContentChange,
      onKeyDown,
      onKeyUp,
      onPaste,
      maxHeight = 200,
    },
    ref
  ) => {
    const [hasText, setHasText] = React.useState(false);
    const innerRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(ref, () => ({
      get element() {
        return innerRef.current;
      },
      getText: () => innerRef.current?.innerText ?? "",
      insertText: (text: string) => {
        const el = innerRef.current;
        if (!el) return;
        el.focus();
        document.execCommand("insertText", false, text);
        setHasText((el.innerText?.length ?? 0) > 0);
      },
      setPlainText: (text: string) => {
        const el = innerRef.current;
        if (!el) return;
        el.innerText = text;
        setHasText(text.length > 0);
      },
      clear: () => {
        if (innerRef.current) {
          innerRef.current.textContent = "";
          setHasText(false);
        }
      },
      focus: () => innerRef.current?.focus(),
    }));

    const handleInput = () => {
      const el = innerRef.current;
      if (!el) return;
      const len = (el.innerText ?? el.textContent ?? "").length;
      setHasText(len > 0);
      onContentChange?.();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const el = innerRef.current;
        if (!el) return;
        const raw = el.innerText ?? "";
        if (onSubmit && raw.trim()) {
          onSubmit(raw);
          el.textContent = "";
          setHasText(false);
        }
      }
    };

    return (
      <div className="relative flex-1 min-w-0">
        {placeholder && (
          <div
            className={cn(
              "absolute top-0 left-0 px-2 py-1.5 pointer-events-none text-sm text-muted-foreground",
              hasText && "hidden"
            )}
          >
            {placeholder}
          </div>
        )}
        <div
          ref={innerRef}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => onKeyUp?.(e)}
          onPaste={(e) => onPaste?.(e)}
          className={cn(
            "w-full overflow-auto px-2 py-1.5 text-sm outline-none focus:outline-none focus-visible:outline-none",
            "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground",
            className
          )}
          style={{ maxHeight }}
          data-placeholder={placeholder}
        />
      </div>
    );
  }
);

ContentEditableInput.displayName = "ContentEditableInput";

export default ContentEditableInput;
