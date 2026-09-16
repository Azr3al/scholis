"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "iconoir-react";

import {
  claimActiveChatVoicePlayer,
  releaseActiveChatVoicePlayer,
} from "@/lib/chat/active-chat-voice-player";
import { cn } from "@/lib/utils";

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type ChatVoicePlayerProps = {
  url: string;
  isMe: boolean;
};

export function ChatVoicePlayer({ url, isMe }: ChatVoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const stopPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  useEffect(() => {
    return () => {
      releaseActiveChatVoicePlayer(stopPlayback);
    };
  }, [stopPlayback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      audio.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onLoadedMetadata();
    }

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [url]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      return;
    }

    claimActiveChatVoicePlayer(stopPlayback);
    void audio.play().catch(() => {
      setIsPlaying(false);
    });
  }, [isPlaying, stopPlayback]);

  const elapsed = formatAudioTime(currentTime);
  const durationLabel = formatAudioTime(duration);
  const timeLabel = `${elapsed} / ${durationLabel}`;

  return (
    <div
      className={cn(
        "inline-flex min-w-[220px] max-w-[280px] items-center gap-3 rounded-xl px-3 py-2.5",
        isMe ? "bg-primary-foreground/15" : "bg-muted/60"
      )}
    >
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isMe ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-primary"
        )}
      >
        {isPlaying ? (
          <Pause className="size-[18px]" aria-hidden />
        ) : (
          <Play className="size-[18px]" aria-hidden />
        )}
      </button>
      <span
        className={cn(
          "tabular-nums text-sm",
          isMe ? "text-primary-foreground" : "text-foreground"
        )}
        aria-live="polite"
      >
        {timeLabel}
      </span>
      <audio ref={audioRef} src={url} preload="metadata" className="hidden">
        <track kind="captions" />
      </audio>
    </div>
  );
}
