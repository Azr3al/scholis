"use client";

import { NativeRecordingPlayer } from "@/components/media/native-recording-player";
import {
  filePlaybackSource,
  type RecordingPlaybackSource,
} from "@/components/media/recording-playback-types";
import { YouTubeRecordingPlayer } from "@/components/media/youtube-recording-player";
import { cn } from "@/lib/utils";

export type { RecordingPlaybackSource } from "@/components/media/recording-playback-types";
export {
  filePlaybackSource,
  playbackFromUserRecording,
  youTubePlaybackSource,
} from "@/components/media/recording-playback-types";

/**
 * Unified inline recording viewer for uploaded files, Teams recordings, and YouTube links.
 */
export function RecordingVideoPlayer({
  source,
  /** @deprecated Pass `source={{ kind: 'file', url }}` instead. */
  src,
  emptyLabel = "No video to play",
  autoPlay = false,
  title,
  subtitle,
  className,
}: {
  source?: RecordingPlaybackSource | null;
  src?: string | null;
  emptyLabel?: string;
  autoPlay?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const resolvedSource: RecordingPlaybackSource | null =
    source ?? (src ? filePlaybackSource(src) : null);

  const hasMetadata = Boolean(title || subtitle);

  if (!resolvedSource) {
    return (
      <div
        className={cn(
          "flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-muted-foreground",
          className
        )}
      >
        <p className="px-4 text-center text-sm">{emptyLabel}</p>
      </div>
    );
  }

  if (resolvedSource.kind === "youtube") {
    if (!resolvedSource.videoId) {
      return (
        <div
          className={cn(
            "flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-muted-foreground",
            className
          )}
        >
          <p className="px-4 text-center text-sm">Invalid YouTube link.</p>
        </div>
      );
    }

    return (
      <div className={cn("space-y-3", className)}>
        {hasMetadata && (
          <RecordingMetadata title={title} subtitle={subtitle} variant="light" />
        )}
        <YouTubeRecordingPlayer videoId={resolvedSource.videoId} title={title} />
        <p className="text-xs text-muted-foreground">
          Playback uses YouTube. Private or restricted videos may not play for all viewers.
        </p>
      </div>
    );
  }

  if (!resolvedSource.url) {
    return (
      <div
        className={cn(
          "flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-muted-foreground",
          className
        )}
      >
        <p className="px-4 text-center text-sm">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {hasMetadata && (
        <RecordingMetadata title={title} subtitle={subtitle} variant="light" />
      )}
      <NativeRecordingPlayer src={resolvedSource.url} autoPlay={autoPlay} />
    </div>
  );
}

function RecordingMetadata({
  title,
  subtitle,
  variant,
}: {
  title?: string;
  subtitle?: string;
  variant: "light" | "dark";
}) {
  if (!title && !subtitle) return null;

  return (
    <div className="space-y-1">
      {title && (
        <h2
          className={cn(
            "text-base font-semibold sm:text-lg",
            variant === "dark" ? "text-white" : "text-foreground"
          )}
        >
          {title}
        </h2>
      )}
      {subtitle && (
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm",
            variant === "dark" ? "text-white/60" : "text-muted-foreground"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

export { RecordingMetadata };
