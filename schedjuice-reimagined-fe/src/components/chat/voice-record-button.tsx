"use client";
import { Button } from "@/components/primitives";

import { Microphone as Mic } from "iconoir-react";

import { cn } from "@/lib/utils";
import type { VoiceRecordingStatus } from "@/lib/chat/use-voice-recorder";
import { chatComposerCopy } from "@/messages/chat-composer";

type VoiceRecordButtonProps = {
  status: VoiceRecordingStatus;
  disabled?: boolean;
  isLoading?: boolean;
  micButtonProps: {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  };
};

export function VoiceRecordButton({
  status,
  disabled = false,
  isLoading = false,
  micButtonProps,
}: VoiceRecordButtonProps) {
  const isRecording = status === "recording" || status === "cancelling";

  return (
    <Button
      type="button"
      size="sm" variant={isRecording ? "primary" : "ghost"}
      className={cn(
        "h-8 w-8 shrink-0 rounded-full touch-none select-none",
        !isRecording && "hover:bg-muted/50"
      )}
      disabled={disabled}
      isLoading={isLoading}
      aria-label={chatComposerCopy.recordVoice}
      title={chatComposerCopy.releaseToSend}
      {...micButtonProps}
    >
      <Mic className="h-4 w-4" aria-hidden />
    </Button>
  );
}
