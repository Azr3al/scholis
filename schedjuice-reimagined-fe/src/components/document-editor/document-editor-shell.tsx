"use client";

import { Button } from "@/components/primitives";
import { shouldConfirmClose } from "@/lib/document-template/should-confirm-close";
import { cn } from "@/lib/utils";
import { useState, type KeyboardEvent, type ReactNode } from "react";

export type DocumentEditorShellProps = {
  title: string;
  onTitleChange: (title: string) => void;
  status: "draft" | "published";
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  saveDisabled?: boolean;
  dirty?: boolean;
  formatBar?: ReactNode;
  children: ReactNode;
};

function commitTitle(draft: string): string {
  return draft.trim() || "Untitled";
}

export function DocumentEditorShell({
  title,
  onTitleChange,
  status,
  onBack,
  onSave,
  onPublish,
  saveDisabled,
  dirty = false,
  formatBar,
  children,
}: DocumentEditorShellProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [titleDirty, setTitleDirty] = useState(false);
  const displayTitle = title.trim() || "Untitled";
  const isDirty = dirty || titleDirty;

  const finishTitle = (next: string) => {
    setEditingTitle(false);
    const committed = commitTitle(next);
    if (committed !== title) {
      setTitleDirty(true);
      onTitleChange(committed);
    }
  };

  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finishTitle(draftTitle);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setEditingTitle(false);
      setDraftTitle(title);
    }
  };

  const handleBack = () => {
    if (
      shouldConfirmClose({ dirty: isDirty, userAccepted: false }) &&
      !window.confirm("Discard unsaved changes?")
    ) {
      return;
    }
    onBack();
  };

  return (
    <div className="flex h-dvh flex-col bg-surface-sunken text-text-primary">
      <header
        data-theme="light"
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border bg-surface px-3 py-2 text-text-primary"
      >
        <Button type="button" variant="ghost" size="sm" onClick={handleBack}>
          Back
        </Button>
        <div className="flex min-w-0 items-center justify-start gap-1 font-serif text-lg text-text-primary">
          <span className="shrink-0 truncate text-text-muted">Documents</span>
          <span className="shrink-0 text-text-muted">/</span>
          <div data-testid="template-name-slot" className="max-w-56 min-w-0">
            {editingTitle ? (
              <input
                aria-label="Template name"
                className="w-full border-0 bg-transparent p-0 text-left font-serif text-lg text-text-primary outline-none"
                value={draftTitle}
                autoFocus
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={() => finishTitle(draftTitle)}
                onKeyDown={onTitleKeyDown}
              />
            ) : (
              <button
                type="button"
                aria-label="Template name"
                className="w-full truncate rounded-sm px-1 text-left font-serif text-lg text-text-primary hover:bg-surface-hover"
                onClick={() => {
                  setDraftTitle(displayTitle);
                  setEditingTitle(true);
                }}
              >
                {displayTitle}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              status === "published"
                ? "bg-surface-hover text-text-secondary"
                : "bg-surface-hover text-text-muted",
            )}
          >
            {status === "published" ? "Published" : "Draft"}
          </span>
          <Button type="button" size="sm" onClick={onSave} disabled={saveDisabled}>
            Save
          </Button>
          <Button type="button" size="sm" onClick={onPublish}>
            Publish
          </Button>
        </div>
      </header>
      {formatBar ? (
        <div
          data-theme="light"
          className="border-b border-border bg-surface px-3 py-1.5 text-text-primary"
        >
          {formatBar}
        </div>
      ) : null}
      <div
        data-theme="dark"
        className="min-h-0 flex-1 overflow-y-auto bg-surface-sunken text-text-primary"
      >
        {children}
      </div>
    </div>
  );
}
