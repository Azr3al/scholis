"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";
import ContentEditableInput, {
  type ContentEditableHandle,
} from "@/components/course/chat/content-editable-input";
import {
  getActiveMentionQuery,
  getCaretPlainOffset,
  replacePlainTextRange,
} from "@/lib/content-editable-plaintext";
import {
  buildChatMentionsFromInsertions,
  filterMentionRoster,
  mentionTokenForMember,
  type BoardMentionRosterMember,
} from "@/lib/board-mentions";
import type { ChatMention } from "@/types/chat";

type MentionPickerState = {
  open: boolean;
  query: string;
  filtered: BoardMentionRosterMember[];
};

const CLOSED_PICKER: MentionPickerState = { open: false, query: "", filtered: [] };

/**
 * Shared board-detail comment composer: contenteditable + `@mention` picker
 * ported from the course chat pattern (not TipTap). Reused by Leads and
 * Issues detail drawers — callers own the roster fetch and the submit
 * mutation so this stays domain-agnostic.
 */
export function MentionCommentComposer({
  roster,
  onSubmit,
  isSubmitting = false,
  placeholder = "Write a comment…",
  submitLabel = "Comment",
  helperText = "Use Cmd/Ctrl + Enter to send.",
  className,
}: {
  roster: BoardMentionRosterMember[];
  onSubmit: (input: { body: string; mentions: ChatMention[] }) => void;
  isSubmitting?: boolean;
  placeholder?: string;
  submitLabel?: string;
  helperText?: string | null;
  className?: string;
}) {
  const editableInputRef = useRef<ContentEditableHandle | null>(null);
  const insertedMentionsRef = useRef<{ user_id: number; label: string }[]>([]);
  const mentionSuppressRef = useRef(false);
  const mentionPickerRef = useRef<MentionPickerState>(CLOSED_PICKER);
  const mentionHighlightRef = useRef(0);
  const [mentionPicker, setMentionPicker] = useState<MentionPickerState>(CLOSED_PICKER);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [hasText, setHasText] = useState(false);

  useEffect(() => {
    mentionPickerRef.current = mentionPicker;
  }, [mentionPicker]);

  useEffect(() => {
    mentionHighlightRef.current = mentionHighlight;
  }, [mentionHighlight]);

  useEffect(() => {
    setMentionHighlight(0);
  }, [mentionPicker.query]);

  const syncMentionUi = useCallback(() => {
    const el = editableInputRef.current?.element;
    if (!el) return;
    const text = el.innerText ?? "";
    const caret = getCaretPlainOffset(el);
    if (mentionSuppressRef.current) {
      const active = getActiveMentionQuery(text, caret);
      if (!active) mentionSuppressRef.current = false;
      setMentionPicker((prev) => ({ ...prev, open: false }));
      return;
    }
    const active = getActiveMentionQuery(text, caret);
    if (!active) {
      setMentionPicker(CLOSED_PICKER);
      return;
    }
    const filtered = filterMentionRoster(roster, active.query);
    setMentionPicker({ open: filtered.length > 0, query: active.query, filtered });
  }, [roster]);

  const onComposerInput = useCallback(() => {
    setHasText((editableInputRef.current?.getText() ?? "").trim().length > 0);
    syncMentionUi();
  }, [syncMentionUi]);

  const applyMentionPick = useCallback(
    (member: BoardMentionRosterMember) => {
      const el = editableInputRef.current?.element ?? null;
      if (!el) return;
      const text = el.innerText ?? "";
      const caret = getCaretPlainOffset(el);
      const active = getActiveMentionQuery(text, caret);
      if (!active) return;
      const token = mentionTokenForMember(member, roster);
      const ok = replacePlainTextRange(el, active.atIndex, caret, `${token} `);
      if (!ok) return;
      insertedMentionsRef.current = [
        ...insertedMentionsRef.current,
        { user_id: member.userId, label: token },
      ];
      setMentionPicker(CLOSED_PICKER);
      mentionSuppressRef.current = false;
      el.focus();
      onComposerInput();
    },
    [roster, onComposerInput]
  );

  const submit = useCallback(() => {
    const raw = editableInputRef.current?.getText() ?? "";
    const trimmed = raw.trim();
    if (!trimmed || isSubmitting) return;
    const mentions = buildChatMentionsFromInsertions(
      trimmed,
      insertedMentionsRef.current
    );
    onSubmit({ body: trimmed, mentions });
    insertedMentionsRef.current = [];
    setMentionPicker(CLOSED_PICKER);
    editableInputRef.current?.clear();
    setHasText(false);
  }, [isSubmitting, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mp = mentionPickerRef.current;
      if (mp.open && mp.filtered.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionHighlight((i) => {
            const n = mentionPickerRef.current.filtered.length;
            return n === 0 ? 0 : (i + 1) % n;
          });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionHighlight((i) => {
            const n = mentionPickerRef.current.filtered.length;
            return n === 0 ? 0 : (i - 1 + n) % n;
          });
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          mentionSuppressRef.current = true;
          setMentionPicker((prev) => ({ ...prev, open: false }));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const choices = mentionPickerRef.current.filtered;
          const hl = Math.min(
            mentionHighlightRef.current,
            Math.max(0, choices.length - 1)
          );
          const pick = choices[hl];
          if (pick) applyMentionPick(pick);
          return;
        }
      }
      if (e.key === "Enter") {
        // Cmd/Ctrl+Enter sends; plain Enter inserts a line break instead of
        // submitting (comments are multi-line, unlike course chat).
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          submit();
        } else {
          document.execCommand("insertLineBreak");
        }
      }
    },
    [applyMentionPick, submit]
  );

  const mentionChoices = mentionPicker.filtered;
  const mentionHl = Math.min(mentionHighlight, Math.max(0, mentionChoices.length - 1));

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative rounded-md border border-border bg-surface">
        {mentionPicker.open && mentionChoices.length > 0 ? (
          <ul
            className="absolute bottom-full left-0 right-0 z-100 mb-1 max-h-40 overflow-y-auto rounded-md border border-border bg-surface-elevated p-1 text-text-primary shadow-md"
            role="listbox"
            aria-label="Mention someone"
          >
            {mentionChoices.map((member, i) => (
              <li key={member.userId} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === mentionHl}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-hover",
                    i === mentionHl && "bg-surface-hover"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyMentionPick(member)}
                >
                  <span className="truncate font-medium leading-tight">
                    {member.name}
                  </span>
                  {member.email ? (
                    <span className="truncate text-xs text-text-muted">
                      {member.email}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <ContentEditableInput
          className="min-h-28 text-sm"
          placeholder={placeholder}
          onContentChange={onComposerInput}
          onKeyDown={handleKeyDown}
          onKeyUp={syncMentionUi}
          ref={editableInputRef}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        {helperText ? (
          <p className="text-xs text-text-muted">{helperText}</p>
        ) : (
          <span />
        )}
        <Button
          disabled={!hasText}
          isLoading={isSubmitting}
          onClick={submit}
          size="sm"
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
