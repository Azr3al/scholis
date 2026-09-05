"use client";

import { Button, buttonVariants, useToast } from "@/components/primitives";
import { cn } from "@/lib/utils";
import {
  CHAT_ATTACHMENT_FILE_INPUT_ACCEPT,
  MAX_CHAT_ATTACHMENT_SIZE_BYTES,
} from "@/lib/chat/chat-attachment-contracts";
import { uploadComplaintAttachments } from "@/lib/chat/chat-attachments";
import type { ChatAttachmentRef } from "@/types/chat";
import { Attachment, Send, Xmark as X } from "iconoir-react";
import { useRef, useState } from "react";

type ComplaintComposerProps = {
  foreignKey: string;
  onSend: (input: { body?: string; attachments?: ChatAttachmentRef[] }) => Promise<void>;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  className?: string;
};

export function ComplaintComposer({
  foreignKey,
  onSend,
  disabled = false,
  isSending = false,
  placeholder = "Write a message…",
  className,
}: ComplaintComposerProps) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBusy = disabled || isSending || isUploadingAttachments;
  const trimmed = text.trim();
  const canSend = !isBusy && (trimmed.length > 0 || selectedFiles.length > 0);

  const handleSend = async () => {
    if (!canSend) return;

    let attachmentRefs: ChatAttachmentRef[] = [];
    if (selectedFiles.length > 0) {
      setIsUploadingAttachments(true);
      try {
        attachmentRefs = await uploadComplaintAttachments(selectedFiles, foreignKey);
      } catch {
        toast.add({ description: "Upload failed. Please try again." });
        setIsUploadingAttachments(false);
        return;
      } finally {
        setIsUploadingAttachments(false);
      }
    }

    try {
      await onSend({
        body: trimmed || undefined,
        attachments: attachmentRefs.length > 0 ? attachmentRefs : undefined,
      });
      setText("");
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      toast.add({ description: "Could not send your message. Please try again." });
    }
  };

  return (
    <div className={cn("space-y-2", className)} aria-busy={isBusy}>
      {selectedFiles.length > 0 ? (
        <div
          className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-muted/30 px-2 py-1.5"
          aria-label="Pending attachments"
        >
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex max-w-[220px] items-center gap-1.5 rounded-lg bg-background/80 px-2 py-1 text-xs"
            >
              <Attachment className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{file.name}</span>
              {isUploadingAttachments ? (
                <span className="shrink-0 text-muted-foreground">Uploading</span>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Remove attachments"
            disabled={isUploadingAttachments}
            onClick={() => {
              setSelectedFiles([]);
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2">
        <label
          className={cn(
            "rounded-full p-1.5 transition-colors",
            isBusy
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer hover:bg-muted/50",
          )}
        >
          <Attachment className="h-5 w-5" aria-hidden />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            disabled={isBusy}
            accept={CHAT_ATTACHMENT_FILE_INPUT_ACCEPT}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              const tooLarge = files.find((file) => file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES);
              if (tooLarge) {
                toast.add({
                  description: `${tooLarge.name} is too large. Max size is 15 MB.`,
                });
                event.target.value = "";
                return;
              }
              setSelectedFiles((prev) => [...prev, ...files]);
              event.target.value = "";
            }}
          />
        </label>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          rows={1}
          disabled={isBusy}
          className="min-h-[2.25rem] max-h-32 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
        />

        <Button
          type="button"
          size="sm"
          variant="primary"
          className="shrink-0 rounded-full px-3"
          disabled={!canSend}
          isLoading={isSending || isUploadingAttachments}
          aria-label="Send message"
          onClick={() => void handleSend()}
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
