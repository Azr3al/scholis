"use client";
import { Popover } from "@/components/primitives";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CHAT_QUICK_REACTION_EMOJIS,
  CHAT_REACTION_EMOJIS,
} from "@/lib/chat/reaction-emojis";
import type { ChatReactionSummary } from "@/types/chat";
import { Emoji as Smile, Emoji as SmilePlus } from "iconoir-react";

type MessageReactionsProps = {
  reactions?: ChatReactionSummary[];
  isMe: boolean;
  canReact: boolean;
  onToggleReaction: (emoji: string) => void;
};

function emojiButtonClass(active: boolean) {
  return cn(
    "flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors",
    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active && "bg-primary/15 ring-1 ring-primary/40"
  );
}

export function useMessageReactionPicker() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return { open, setOpen, rootRef };
}

export function MessageReactionStrip({
  open,
  reactions,
  isMe,
  onToggleReaction,
  onClose,
}: {
  open: boolean;
  reactions?: ChatReactionSummary[];
  isMe: boolean;
  onToggleReaction: (emoji: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const mine = reactions?.find((r) => r.reacted_by_me)?.emoji;

  const select = (emoji: string) => {
    onToggleReaction(emoji);
    onClose();
  };

  return (
    <div
      className={cn(
        "absolute z-30 -top-1 -translate-y-full flex",
        isMe ? "right-0" : "left-0"
      )}
    >
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-background px-1 py-0.5 shadow-md">
        {CHAT_QUICK_REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={emojiButtonClass(mine === emoji)}
            aria-label={`React with ${emoji}`}
            onClick={() => select(emoji)}
          >
            {emoji}
          </button>
        ))}
        <Popover.Root>
          <Popover.Trigger
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="More reactions"
          >
            <SmilePlus className="h-4 w-4" aria-hidden />
          </Popover.Trigger>
          <Popover.Portal>
        <Popover.Positioner
            side="top"
            align={isMe ? "end" : "start"}
            sideOffset={6}
          >
        <Popover.Popup
            className="w-auto p-2"
          >
            <div className="flex flex-wrap gap-1 max-w-[11rem]">
              {CHAT_REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={emojiButtonClass(mine === emoji)}
                  aria-label={`React with ${emoji}`}
                  onClick={() => select(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}

export function MessageReactButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "p-1 rounded-full text-foreground/55 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active && "bg-muted text-foreground"
      )}
      aria-label="Add reaction"
      aria-expanded={active}
    >
      <Smile className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function MessageReactionChips({
  reactions,
  isMe,
  canReact,
  onToggleReaction,
}: MessageReactionsProps) {
  if (!reactions?.length) return null;

  return (
    <div
      className={cn(
        "mt-1 flex flex-wrap gap-1",
        isMe ? "justify-end" : "justify-start"
      )}
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!canReact}
          onClick={() => onToggleReaction(r.emoji)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
            r.reacted_by_me
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-muted/80 text-muted-foreground hover:bg-muted",
            canReact && "cursor-pointer",
            !canReact && "cursor-default"
          )}
          title={
            r.reacted_by_me
              ? `${r.emoji} · You and ${Math.max(0, r.count - 1)} others`
              : `${r.emoji} · ${r.count}`
          }
        >
          <span className="text-base leading-none">{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  );
}
