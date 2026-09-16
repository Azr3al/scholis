"use client";
import { Button, Select, Slider, buttonVariants } from "@/components/primitives";

import { useCallback, useEffect, useRef, useState } from "react";
import { Expand as Maximize, Reduce as Minimize, Pause, Play, Undo as RotateCcw, Redo as RotateCw, SoundHigh as Volume2, SoundOff as VolumeX } from "iconoir-react";
import { cn } from "@/lib/utils";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SEEK_STEP_SECONDS = 10;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function NativeRecordingPlayer({
  src,
  autoPlay = false,
  className,
}: {
  src: string;
  autoPlay?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const scheduleHideControls = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
      }
    }, 2500);
  }, []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setPlaying(true);
      scheduleHideControls();
    } else {
      video.pause();
      setPlaying(false);
      setControlsVisible(true);
    }
  }, [scheduleHideControls]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.min(Math.max(video.currentTime + delta, 0), video.duration || 0);
    video.currentTime = next;
    setCurrentTime(next);
    revealControls();
  }, [revealControls]);

  const seekTo = useCallback((value: number | readonly number[]) => {
    const video = videoRef.current;
    const next = Array.isArray(value) ? value[0] : value;
    if (!video || next == null) return;
    video.currentTime = next;
    setCurrentTime(next);
    revealControls();
  }, [revealControls]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    revealControls();
  }, [revealControls]);

  const changeVolume = useCallback((value: number | readonly number[]) => {
    const video = videoRef.current;
    const next = Array.isArray(value) ? value[0] : value;
    if (!video || next == null) return;
    video.volume = next;
    video.muted = next === 0;
    setVolume(next);
    setMuted(video.muted);
    revealControls();
  }, [revealControls]);

  const changePlaybackRate = useCallback((rate: string) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Number(rate);
    video.playbackRate = next;
    setPlaybackRate(next);
    revealControls();
  }, [revealControls]);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      await container.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
    revealControls();
  }, [revealControls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoaded = () => {
      setDuration(video.duration || 0);
      setVolume(video.volume);
      setMuted(video.muted);
      setPlaybackRate(video.playbackRate);
      if (autoPlay) {
        void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      setControlsVisible(true);
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, [autoPlay, src]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === " " || key === "k") {
        event.preventDefault();
        void togglePlay();
      } else if (key === "arrowleft") {
        event.preventDefault();
        seekBy(-SEEK_STEP_SECONDS);
      } else if (key === "arrowright") {
        event.preventDefault();
        seekBy(SEEK_STEP_SECONDS);
      } else if (key === "m") {
        event.preventDefault();
        toggleMute();
      } else if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seekBy, toggleFullscreen, toggleMute, togglePlay]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-lg bg-black text-white",
        className
      )}
      onMouseMove={revealControls}
      onMouseLeave={() => {
        if (playing) setControlsVisible(false);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <video
        ref={videoRef}
        key={src}
        src={src}
        className="h-full w-full"
        playsInline
        preload="metadata"
        draggable={false}
        disablePictureInPicture
        disableRemotePlayback
        onClick={() => void togglePlay()}
        onContextMenu={(event) => event.preventDefault()}
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 transition-opacity duration-200",
          controlsVisible || !playing ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 space-y-2 p-3 transition-opacity duration-200 sm:p-4",
          controlsVisible || !playing
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
      >
        <div className="relative h-1.5 w-full">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 0}
            step={0.1}
            onValueChange={seekTo}
            aria-label="Seek"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            type="button"
            size="sm" variant="ghost"
            className="h-9 w-9 text-white hover:bg-white/15 hover:text-white"
            onClick={() => void togglePlay()}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>

          <Button
            type="button"
            size="sm" variant="ghost"
            className="hidden h-9 w-9 text-white hover:bg-white/15 hover:text-white sm:inline-flex"
            onClick={() => seekBy(-SEEK_STEP_SECONDS)}
            aria-label="Rewind 10 seconds"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            size="sm" variant="ghost"
            className="hidden h-9 w-9 text-white hover:bg-white/15 hover:text-white sm:inline-flex"
            onClick={() => seekBy(SEEK_STEP_SECONDS)}
            aria-label="Forward 10 seconds"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <div className="min-w-[5.5rem] text-xs tabular-nums text-white/90 sm:text-sm">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              size="sm" variant="ghost"
              className="h-9 w-9 text-white hover:bg-white/15 hover:text-white"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>

            <div className="hidden w-24 sm:block">
              <Slider
                value={[muted ? 0 : volume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={changeVolume}
                aria-label="Volume"
              />
            </div>

            <Select
              value={String(playbackRate)}
              onValueChange={changePlaybackRate}
              className="h-8 w-[4.5rem] border-white/20 bg-black/40 text-xs text-white"
              items={PLAYBACK_RATES.map((rate) => ({
                value: String(rate),
                label: `${rate}x`,
              }))}
            />

            <Button
              type="button"
              size="sm" variant="ghost"
              className="h-9 w-9 text-white hover:bg-white/15 hover:text-white"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
