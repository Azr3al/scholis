"use client";

import { Spinner } from "@/components/primitives/spinner";
import { Avatar } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { emojify } from "@/lib/emoji";
import type { ChatOutboxItem } from "@/types/chat";
import { ChatAttachmentRenderer } from "./chat-attachment-renderer";

type RunPos = "single" | "first" | "middle" | "last";

function outgoingBubbleRounding(runPosition: RunPos): string {
  switch (runPosition) {
    case "single":
      return "rounded-2xl rounded-br-md";
    case "first":
      return "rounded-2xl rounded-br-sm";
    case "middle":
      return "rounded-sm rounded-r-2xl rounded-l-md";
    case "last":
      return "rounded-2xl rounded-tr-sm rounded-br-md";
    default:
      return "rounded-2xl rounded-br-md";
  }
}

export default function PendingMessageBubble({
  item,
  onRetry,
  showAuthor,
  avatarUrl,
  runPosition = "single",
  hideAvatar = true,
  replyPreview,
  /** When false, outbox rows are queued for WebSocket — show "Sending…". When true, omit spinner (send is immediate). */
  webSocketReady = false,
}: {
  item: ChatOutboxItem;
  onRetry: (localId: string) => void;
  showAuthor: boolean;
  avatarUrl?: string | null;
  runPosition?: RunPos;
  /** Outgoing messages hide the avatar column (Messenger-style). */
  hideAvatar?: boolean;
  replyPreview?: { authorName: string; text: string } | null;
  webSocketReady?: boolean;
}) {
  const text = emojify(item.content?.text ?? "");
  const attachments = item.content?.attachments ?? [];
  const isFailed = item.status === "failed";
  const showSendingRow =
    !isFailed &&
    (item.status === "pending" || item.status === "sending") &&
    !webSocketReady;

  const bubbleRound = outgoingBubbleRounding(runPosition);
  const marginClass =
    runPosition === "first" || runPosition === "single" ? "mt-3" : "mt-0.5";

  return (
    <div
      className={cn(
        "flex gap-2 items-end max-w-[85%]",
        "flex-row-reverse ml-auto",
        marginClass
      )}
    >
      {!hideAvatar && (
        <Avatar
          src={avatarUrl ?? undefined}
          name="You"
          className="w-7 h-7 shrink-0 rounded-full text-[10px] bg-muted"
        />
      )}
      <div className={cn("flex flex-col", "items-end")}>
        {showAuthor && (
          <span className="text-[11px] text-muted-foreground mb-0.5 truncate max-w-[180px]">
            You
          </span>
        )}
        <div
          className={cn(
            "px-3 py-2 text-sm break-words max-w-full",
            bubbleRound,
            isFailed
              ? "border border-destructive/40 bg-destructive/5 text-foreground"
              : "bg-muted/70 text-foreground/90"
          )}
        >
          {replyPreview && (
            <div className="mb-1.5 pb-1.5 border-b border-foreground/10 text-left">
              <p className="text-[11px] font-medium text-foreground/90">
                {replyPreview.authorName}
              </p>
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                {replyPreview.text}
              </p>
            </div>
          )}
          {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
          <ChatAttachmentRenderer attachments={attachments} isMe />
          {showSendingRow && (
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
              <Spinner className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Sending…</span>
            </div>
          )}
          {isFailed && (
            <div className="mt-2 flex flex-col gap-1.5 items-end">
              <span className="text-[11px] text-destructive">
                {item.error ?? "Not sent"}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onRetry(item.localId)}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
