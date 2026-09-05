"use client";

import { Button, buttonVariants, Menu } from "@/components/primitives";
import type { PaletteItem } from "@/lib/image-template/types";
import { cn } from "@/lib/utils";
import { Hashtag, MediaImage, Text } from "iconoir-react";
import Link from "next/link";
import { useState, type KeyboardEvent, type ReactNode } from "react";

export type EditorShellProps = {
  section: string;
  title: string;
  onTitleChange: (title: string) => void;
  backHref: string;
  onBack?: () => void;
  onSave: () => void;
  onPreview?: () => void;
  saveDisabled?: boolean;
  showPhoto: boolean;
  fieldItems: PaletteItem[];
  onAdd: (key: string) => void;
  inspector: ReactNode;
  layers: ReactNode;
  children: ReactNode;
};

function commitTitle(draft: string): string {
  return draft.trim() || "Untitled";
}

export function EditorShell({
  section,
  title,
  onTitleChange,
  backHref,
  onBack,
  onSave,
  onPreview,
  saveDisabled,
  showPhoto,
  fieldItems,
  onAdd,
  inspector,
  layers,
  children,
}: EditorShellProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const displayTitle = title.trim() || "Untitled";

  const finishTitle = (next: string) => {
    setEditingTitle(false);
    const committed = commitTitle(next);
    if (committed !== title) onTitleChange(committed);
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

  return (
    <div className="flex h-dvh flex-col bg-surface-sunken text-text-primary">
      <header
        data-theme="light"
        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border bg-surface px-3 py-2 text-text-primary"
      >
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          onClick={(event) => {
            if (!onBack) return;
            event.preventDefault();
            onBack();
          }}
        >
          Back
        </Link>
        <div className="flex min-w-0 items-center justify-start gap-1 font-serif text-lg text-text-primary">
          <span className="shrink-0 truncate text-text-muted">{section}</span>
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
          {onPreview ? (
            <Button type="button" variant="ghost" size="sm" onClick={onPreview}>
              Preview
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={onSave} disabled={saveDisabled}>
            Save
          </Button>
        </div>
      </header>
      <div
        data-theme="dark"
        className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_16rem] text-text-primary"
      >
        <main className="relative min-h-0 min-w-0 overflow-hidden bg-surface-sunken">
          <div className="pointer-events-auto absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-full border border-border bg-surface-elevated p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Text"
              className="size-8 px-0"
              onClick={() => onAdd("text")}
            >
              <Text width={18} height={18} aria-hidden />
            </Button>
            {showPhoto ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Photo"
                className="size-8 px-0"
                onClick={() => onAdd("photo")}
              >
                <MediaImage width={18} height={18} aria-hidden />
              </Button>
            ) : null}
            {fieldItems.length > 0 ? (
              <Menu.Root>
                <Menu.Trigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Fields"
                      className="size-8 px-0"
                    >
                      <Hashtag width={18} height={18} aria-hidden />
                    </Button>
                  }
                />
                <Menu.Portal>
                  <Menu.Positioner side="right" align="start">
                    <Menu.Popup>
                      {fieldItems.map((item) => {
                        const visual = item.visual ?? "text";
                        const Icon = visual === "image" ? MediaImage : Hashtag;
                        return (
                          <Menu.Item
                            key={item.key}
                            className="justify-start"
                            data-testid={`field-item-${item.key}`}
                            data-field-visual={visual}
                            onClick={() => onAdd(item.key)}
                          >
                            <Icon width={16} height={16} aria-hidden />
                            {item.label}
                          </Menu.Item>
                        );
                      })}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            ) : null}
          </div>
          {children}
        </main>
        <aside className="flex min-h-0 flex-col border-l border-border">
          <div className="min-h-0 flex-1 overflow-auto p-3 text-sm text-text-primary">
            {inspector}
          </div>
          <div className="border-t border-border p-3 text-sm text-text-primary">
            {layers}
          </div>
        </aside>
      </div>
    </div>
  );
}
