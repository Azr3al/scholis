"use client";

import { Microphone as Mic } from "iconoir-react";

import { cn } from "@/lib/utils";
import type { VoiceRecordingStatus } from "@/lib/chat/use-voice-recorder";
import { chatComposerCopy } from "@/messages/chat-composer";

type VoiceRecordingOverlayProps = {
  status: VoiceRecordingStatus;
  durationMs: number;
};

function formatRecordingTimer(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function VoiceRecordingOverlay({
  status,
  durationMs,
}: VoiceRecordingOverlayProps) {
  const isCancelling = status === "cancelling";

  return (
    <div
      className="mb-2 flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isCancelling ? "bg-destructive/15" : "bg-primary/15 animate-pulse"
        )}
      >
        <Mic
          className={cn(
            "h-4 w-4",
            isCancelling ? "text-destructive" : "text-primary"
          )}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium tabular-nums",
            isCancelling ? "text-destructive" : "text-foreground"
          )}
        >
          {formatRecordingTimer(durationMs)}
        </p>
        <p className="text-xs text-muted-foreground">
          {chatComposerCopy.slideToCancel}
        </p>
      </div>
    </div>
  );
}
