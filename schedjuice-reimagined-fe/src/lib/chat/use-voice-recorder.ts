"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export const MIN_VOICE_RECORDING_MS = 300;
const MAX_VOICE_RECORDING_MS = 3 * 60 * 1000;
export const VOICE_CANCEL_DRAG_THRESHOLD_PX = 80;

export type VoiceRecordingStatus = "idle" | "recording" | "cancelling";

type VoiceRecordingStopReason = "sent" | "cancelled" | "too_short";

type VoiceRecorderMimePreset = {
  mimeType: string;
  ext: ".webm" | ".m4a";
  blobType: string;
};

const VOICE_MIME_PREFERENCES: readonly VoiceRecorderMimePreset[] = [
  {
    mimeType: "audio/webm;codecs=opus",
    ext: ".webm",
    blobType: "audio/webm",
  },
  {
    mimeType: "audio/mp4",
    ext: ".m4a",
    blobType: "audio/mp4",
  },
];

export function pickSupportedVoiceRecorderMime(): VoiceRecorderMimePreset | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const preset of VOICE_MIME_PREFERENCES) {
    if (MediaRecorder.isTypeSupported(preset.mimeType)) {
      return preset;
    }
  }
  return null;
}

export function shouldSendVoiceRecording(options: {
  send: boolean;
  durationMs: number;
  isCancelling?: boolean;
  minDurationMs?: number;
}): boolean {
  const min = options.minDurationMs ?? MIN_VOICE_RECORDING_MS;
  if (options.isCancelling || !options.send) return false;
  return options.durationMs >= min;
}

export function voiceDragStatusFromPan(
  current: VoiceRecordingStatus,
  dx: number
): VoiceRecordingStatus {
  if (current === "idle") return "idle";
  if (dx < -VOICE_CANCEL_DRAG_THRESHOLD_PX) return "cancelling";
  if (current === "cancelling" && dx >= -VOICE_CANCEL_DRAG_THRESHOLD_PX) {
    return "recording";
  }
  return current;
}

function buildVoiceFileFromBlob(
  blob: Blob,
  preset: VoiceRecorderMimePreset
): File {
  const timestamp = Date.now();
  return new File([blob], `voice-${timestamp}${preset.ext}`, {
    type: preset.blobType,
  });
}

type UseVoiceRecorderOptions = {
  onRecordingComplete?: (
    file: File | null,
    reason: VoiceRecordingStopReason
  ) => void;
  onPermissionDenied?: () => void;
  disabled?: boolean;
};

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}) {
  const { onRecordingComplete, onPermissionDenied, disabled = false } =
    options;

  const [status, setStatus] = useState<VoiceRecordingStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);

  const statusRef = useRef(status);
  statusRef.current = status;

  const recordingStartedAtRef = useRef<number | null>(null);
  const stopInProgressRef = useRef(false);
  const pointerStartXRef = useRef<number | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimePresetRef = useRef<VoiceRecorderMimePreset | null>(null);

  const clearMaxDurationTimer = useCallback(() => {
    if (maxDurationTimerRef.current != null) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current != null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const releaseMedia = useCallback(() => {
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const resolveDurationMs = useCallback(() => {
    if (recordingStartedAtRef.current == null) return 0;
    return Date.now() - recordingStartedAtRef.current;
  }, []);

  const finishRecording = useCallback(
    async (send: boolean) => {
      if (stopInProgressRef.current || statusRef.current === "idle") {
        return null;
      }

      stopInProgressRef.current = true;
      clearMaxDurationTimer();
      clearDurationTimer();

      const wasCancelling = statusRef.current === "cancelling";
      const durationMs = resolveDurationMs();
      const recorder = mediaRecorderRef.current;
      const preset = mimePresetRef.current;

      const stopPromise = new Promise<Blob | null>((resolve) => {
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          if (!preset || chunksRef.current.length === 0) {
            resolve(null);
            return;
          }
          resolve(new Blob(chunksRef.current, { type: preset.blobType }));
        };
        try {
          recorder.stop();
        } catch {
          resolve(null);
        }
      });

      const blob = await stopPromise;
      releaseMedia();

      setStatus("idle");
      setDurationMs(0);
      recordingStartedAtRef.current = null;
      stopInProgressRef.current = false;
      pointerStartXRef.current = null;

      const willSend = shouldSendVoiceRecording({
        send,
        durationMs,
        isCancelling: wasCancelling,
      });

      if (!willSend) {
        const reason: VoiceRecordingStopReason =
          wasCancelling || !send ? "cancelled" : "too_short";
        onRecordingComplete?.(null, reason);
        return null;
      }

      if (!blob || !preset) {
        onRecordingComplete?.(null, "cancelled");
        return null;
      }

      const file = buildVoiceFileFromBlob(blob, preset);
      onRecordingComplete?.(file, "sent");
      return file;
    },
    [
      clearDurationTimer,
      clearMaxDurationTimer,
      onRecordingComplete,
      releaseMedia,
      resolveDurationMs,
    ]
  );

  const startRecording = useCallback(async () => {
    if (disabled || statusRef.current !== "idle" || stopInProgressRef.current) {
      return;
    }

    const preset = pickSupportedVoiceRecorderMime();
    if (!preset) {
      onPermissionDenied?.();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onPermissionDenied?.();
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onPermissionDenied?.();
      return;
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType: preset.mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.start();

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      mimePresetRef.current = preset;
      recordingStartedAtRef.current = Date.now();
      setDurationMs(0);
      setStatus("recording");

      durationTimerRef.current = setInterval(() => {
        setDurationMs(resolveDurationMs());
      }, 100);

      maxDurationTimerRef.current = setTimeout(() => {
        void finishRecording(true);
      }, MAX_VOICE_RECORDING_MS);
    } catch {
      releaseMedia();
      recordingStartedAtRef.current = null;
      setStatus("idle");
      setDurationMs(0);
    }
  }, [disabled, finishRecording, onPermissionDenied, releaseMedia, resolveDurationMs]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || statusRef.current !== "idle") return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerStartXRef.current = event.clientX;
      void startRecording();
    },
    [disabled, startRecording]
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (statusRef.current === "idle" || pointerStartXRef.current == null) {
      return;
    }
    const dx = event.clientX - pointerStartXRef.current;
    const next = voiceDragStatusFromPan(statusRef.current, dx);
    if (next !== statusRef.current) {
      setStatus(next);
    }
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (statusRef.current === "idle") return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      void finishRecording(true);
    },
    [finishRecording]
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (statusRef.current === "idle") return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      void finishRecording(false);
    },
    [finishRecording]
  );

  useEffect(() => {
    return () => {
      clearMaxDurationTimer();
      clearDurationTimer();
      releaseMedia();
    };
  }, [clearDurationTimer, clearMaxDurationTimer, releaseMedia]);

  const isRecording = status === "recording" || status === "cancelling";

  return {
    status,
    durationMs,
    isRecording,
    isSupported: pickSupportedVoiceRecorderMime() != null,
    micButtonProps: {
      onPointerDown,
      onPointerUp,
      onPointerMove,
      onPointerCancel,
    },
    recordingContainerProps: isRecording
      ? {
          onPointerMove,
          onPointerUp,
          onPointerCancel,
        }
      : undefined,
  };
}
