const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.75;
const SKIP_IF_UNDER_BYTES = 200 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function scaledDimensions(
  width: number,
  height: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height };
  }
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export function shouldSkipCompression(file: File): boolean {
  return file.size <= SKIP_IF_UNDER_BYTES && file.type !== "image/png";
}

export async function compressImageForTeams(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }
  if (shouldSkipCompression(file)) {
    return file;
  }

  const img = await loadImage(file);
  const { width, height } = scaledDimensions(img.width, img.height, MAX_LONG_EDGE);
  if (
    width === img.width &&
    height === img.height &&
    file.size <= SKIP_IF_UNDER_BYTES
  ) {
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return file;
  }
  ctx.drawImage(img, 0, 0, width, height);

  const outputType =
    file.type === "image/png" || file.type === "image/webp"
      ? "image/jpeg"
      : file.type || "image/jpeg";
  const blob = await canvasToBlob(canvas, outputType, JPEG_QUALITY);
  if (!blob) {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  const ext = outputType === "image/jpeg" ? ".jpg" : "";
  return new File([blob], `${baseName}${ext}`, { type: outputType });
}

export const compressImageForTeamsConstants = {
  MAX_LONG_EDGE,
  JPEG_QUALITY,
  SKIP_IF_UNDER_BYTES,
};
