"use client";
import { Button } from "@/components/primitives";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "iconoir-react";
import {
  captureVideoFrameToFile,
  isLiveCameraSupported,
  mapGetUserMediaError,
  type LiveCameraErrorReason,
} from "@/components/camera/live-camera-capture-utils";

export type { LiveCameraErrorReason };

interface LiveCameraCaptureProps {
  onCapture: (file: File) => void;
  onError: (reason: LiveCameraErrorReason) => void;
  disabled?: boolean;
}

export function LiveCameraCapture({
  onCapture,
  onError,
  disabled = false,
}: LiveCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isStarting, setIsStarting] = useState(true);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLive(false);
  }, []);

  const startStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setIsLive(true);
  }, []);

  const onCaptureRef = useRef(onCapture);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCaptureRef.current = onCapture;
    onErrorRef.current = onError;
  }, [onCapture, onError]);

  useEffect(() => {
    if (!isLiveCameraSupported()) {
      onErrorRef.current("unsupported");
      setIsStarting(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await startStream();
      } catch (err) {
        if (cancelled) return;
        onErrorRef.current(mapGetUserMediaError(err));
      } finally {
        if (!cancelled) setIsStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
      revokePreviewUrl();
    };
  }, [revokePreviewUrl, startStream, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !isLive) return;

    void captureVideoFrameToFile(video).then((file) => {
      if (!file) return;
      stopStream();
      revokePreviewUrl();
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      onCaptureRef.current(file);
    });
  };

  const handleRetake = async () => {
    revokePreviewUrl();
    setPreviewUrl(null);
    setIsStarting(true);
    try {
      await startStream();
    } catch {
      onErrorRef.current("denied");
    } finally {
      setIsStarting(false);
    }
  };

  if (previewUrl) {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-lg border-2 border-dashed border-gray-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Captured check-in photo"
            className="mx-auto h-48 w-full object-cover"
          />
        </div>
        <p className="text-center text-sm text-muted-foreground">Photo captured</p>
        <Button
          type="button"
          variant="secondary" className="w-full"
          onClick={() => void handleRetake()}
          disabled={disabled}
        >
          Retake
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="mx-auto h-48 w-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        {!isLive && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Camera className="h-8 w-8" />
          </div>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {isStarting ? "Starting camera…" : "Position your face in the frame"}
      </p>
      <Button
        type="button"
        variant="secondary" className="w-full"
        onClick={handleCapture}
        disabled={disabled || isStarting || !isLive}
      >
        Take photo
      </Button>
    </div>
  );
}
