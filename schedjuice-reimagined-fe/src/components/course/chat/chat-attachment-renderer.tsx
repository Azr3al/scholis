"use client";

import { Page as FileText } from "iconoir-react";
import { cn } from "@/lib/utils";
import { isRasterImageFilename } from "@/lib/announcement/is-raster-image-filename";
import { isChatAudioAttachment } from "@/lib/chat/chat-attachment-contracts";
import type { ChatAttachmentRef } from "@/types/chat";
import { ChatVoicePlayer } from "./chat-voice-player";

function attachmentExtension(att: ChatAttachmentRef): string {
  const name = att.name || "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function isImageAttachment(att: ChatAttachmentRef): boolean {
  return (
    (att.mime_type?.startsWith("image/") ?? false) ||
    isRasterImageFilename(att.name || "")
  );
}

function isVideoAttachment(att: ChatAttachmentRef): boolean {
  return (
    (att.mime_type?.startsWith("video/") ?? false) ||
    ["mp4", "mov", "webm", "mkv"].includes(attachmentExtension(att))
  );
}

export function ChatAttachmentRenderer({
  attachments,
  isMe,
}: {
  attachments: ChatAttachmentRef[];
  isMe: boolean;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {attachments.map((att) => {
        const url = att.download_url;
        const key = `${att.attachment_id}-${att.name}`;

        if (url && isImageAttachment(att)) {
          return (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl"
            >
              <img
                src={url}
                alt={att.name}
                className="max-h-64 max-w-full rounded-xl object-contain"
                loading="lazy"
              />
            </a>
          );
        }

        if (url && isVideoAttachment(att)) {
          return (
            <video
              key={key}
              src={url}
              controls
              className="max-h-64 max-w-full rounded-xl"
            />
          );
        }

        if (url && isChatAudioAttachment(att)) {
          return <ChatVoicePlayer key={key} url={url} isMe={isMe} />;
        }

        return (
          <a
            key={key}
            href={url || "#"}
            target={url ? "_blank" : undefined}
            rel={url ? "noreferrer" : undefined}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs underline-offset-2",
              url && "underline",
              isMe
                ? "bg-primary-foreground/10 text-primary-foreground"
                : "bg-background/70 text-primary"
            )}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{att.name}</span>
          </a>
        );
      })}
    </div>
  );
}
