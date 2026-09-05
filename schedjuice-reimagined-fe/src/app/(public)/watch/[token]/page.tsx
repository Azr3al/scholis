"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  getJuiceBoxOrigin,
  isJuiceBoxConfigured,
} from "@/lib/juicebox/auth";
import {
  RecordingVideoPlayer,
  playbackFromUserRecording,
} from "@/components/media/recording-video-player";
import type { RecordingPlaybackSource } from "@/components/media/recording-playback-types";

interface RecordingData {
  type: "teams" | "uploaded";
  id: number;
  course_name: string | null;
  created_datetime?: string | null;
  recorded_date?: string | null;
  description?: string;
  source_type?: "file" | "youtube";
  youtube_url?: string | null;
  youtube_video_id?: string | null;
  playback?: RecordingPlaybackSource | null;
  download_url?: string | null;
  schema?: string;
  share_token?: string;
}

type Status = "loading" | "ready" | "expired" | "error";

function resolvePlayback(recording: RecordingData, videoUrl: string | null): RecordingPlaybackSource | null {
  const fromApi = playbackFromUserRecording({
    ...recording,
    download_url: recording.download_url ?? videoUrl,
  });
  if (fromApi) return fromApi;

  return null;
}

function formatRecordedSubtitle(recording: RecordingData): string {
  const datePart =
    recording.type === "teams" && recording.created_datetime
      ? `Recorded ${new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(recording.created_datetime))}`
      : recording.recorded_date
        ? `Recorded ${new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
          }).format(new Date(recording.recorded_date))}`
        : "Class Recording";

  const parts = [datePart];
  if (recording.description) parts.push(recording.description);
  if (recording.source_type === "youtube") parts.push("YouTube");
  return parts.join(" — ");
}

export default function WatchPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [recording, setRecording] = useState<RecordingData | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    async function load() {
      try {
        const apiBase = (process.env.NEXT_PUBLIC_BASE_API_URL || "/api/v1").replace(/\/$/, "");
        const metaRes = await fetch(`${apiBase}/shared-recording/${token}`);
        const metaJson = await metaRes.json();

        if (!metaRes.ok) {
          if (metaRes.status === 410) {
            setStatus("expired");
            setErrorMessage(
              metaJson?.data?.details || "This share link has expired."
            );
            return;
          }
          setStatus("error");
          setErrorMessage(
            metaJson?.data?.details || "Invalid or expired share link."
          );
          return;
        }

        const data: RecordingData = metaJson.data;
        setRecording(data);

        if (data.source_type === "youtube" && data.youtube_video_id) {
          setStatus("ready");
          return;
        }

        if (data.download_url) {
          setVideoUrl(data.download_url);
          setStatus("ready");
          return;
        }

        if (data.type === "teams") {
          setStatus("error");
          setErrorMessage("Recording video is not available.");
        } else if (data.type === "uploaded") {
          if (!isJuiceBoxConfigured()) {
            setStatus("error");
            setErrorMessage("Recording video is not available.");
            return;
          }
          const shareRes = await fetch(
            `${getJuiceBoxOrigin()}/attachments/shared/${token}`
          );
          if (!shareRes.ok) {
            const shareJson = await shareRes.json();
            if (shareRes.status === 410) {
              setStatus("expired");
              setErrorMessage(
                shareJson?.error || "This share link has expired."
              );
              return;
            }
            setStatus("error");
            setErrorMessage(shareJson?.error || "Failed to load recording.");
            return;
          }
          const shareJson = await shareRes.json();
          setVideoUrl(shareJson.downloadUrl);
          setStatus("ready");
        } else {
          setStatus("error");
          setErrorMessage("Recording video is not available.");
        }
      } catch {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again later.");
      }
    }

    void load();
  }, [token]);

  const playbackSource = useMemo(
    () => (recording ? resolvePlayback(recording, videoUrl) : null),
    [recording, videoUrl]
  );

  useEffect(() => {
    const name = recording?.course_name;
    if (!name) return;
    const prev = document.title;
    document.title = `${name} · Recording`;
    return () => {
      document.title = prev;
    };
  }, [recording?.course_name]);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <svg
            className="h-6 w-6 text-primary"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
          </svg>
          <span className="text-sm font-medium tracking-wide text-white/80">
            Schedjuice
          </span>
        </div>
        {recording?.course_name && (
          <span className="min-w-0 max-w-[min(100%,16rem)] truncate text-right text-sm text-white/50 sm:max-w-md">
            {recording.course_name}
          </span>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-4">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/60">Loading recording...</p>
          </div>
        )}

        {status === "expired" && (
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <svg
                className="h-8 w-8 text-white/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">Link Expired</h1>
            <p className="text-sm text-white/60">{errorMessage}</p>
            <p className="text-xs text-white/40">
              Share links expire after 10 days. Ask the sender for a new link.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
              <svg
                className="h-8 w-8 text-white/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">Unable to Play</h1>
            <p className="text-sm text-white/60">{errorMessage}</p>
          </div>
        )}

        {status === "ready" && recording && playbackSource && (
          <div className="flex w-full max-w-5xl flex-col gap-4">
            <RecordingVideoPlayer
              source={playbackSource}
              title={recording.course_name ?? undefined}
              subtitle={formatRecordedSubtitle(recording)}
              autoPlay={playbackSource.kind === "file"}
              emptyLabel="Recording video is not available."
              className="[&_h2]:text-white [&_p]:text-white/60"
            />

            <p className="text-center text-xs text-white/30">
              This link expires 10 days after it was created.
            </p>
          </div>
        )}

        {status === "ready" && recording && !playbackSource && (
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <h1 className="text-xl font-semibold">Unable to Play</h1>
            <p className="text-sm text-white/60">Recording video is not available.</p>
          </div>
        )}
      </main>
    </div>
  );
}
