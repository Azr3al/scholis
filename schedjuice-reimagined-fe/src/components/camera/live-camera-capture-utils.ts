export type LiveCameraErrorReason = "denied" | "unsupported" | "failed";

export function mapGetUserMediaError(err: unknown): LiveCameraErrorReason {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "denied";
  }
  return "failed";
}

export function isLiveCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function captureVideoFrameToFile(
  video: HTMLVideoElement,
  fileNamePrefix = "campus-checkin",
): Promise<File | null> {
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  ctx.drawImage(video, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(
          new File([blob], `${fileNamePrefix}-${Date.now()}.jpg`, {
            type: "image/jpeg",
          }),
        );
      },
      "image/jpeg",
      0.92,
    );
  });
}
