import type { Area } from "react-easy-crop";

const DEFAULT_MAX_LONG_EDGE = 2048;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () =>
      reject(new Error("Failed to load image for cropping"))
    );
    img.src = src;
  });
}

function blobFromCanvas(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Failed to encode cropped image"));
        else resolve(blob);
      },
      mimeType,
      mimeType === "image/jpeg" ? quality : undefined
    );
  });
}

export type CropBlobOptions = {
  maxLongEdge?: number;
  mimeType?: string;
  quality?: number;
};

/**
 * Renders `pixelCrop` from react-easy-crop into a Blob, optionally downscaling
 * so the long edge is at most `maxLongEdge`.
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  options?: CropBlobOptions
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const maxLongEdge = options?.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;

  let cropW = pixelCrop.width;
  let cropH = pixelCrop.height;

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    cropW,
    cropH
  );

  let outCanvas = canvas;
  const longEdge = Math.max(cropW, cropH);
  if (longEdge > maxLongEdge) {
    const scale = maxLongEdge / longEdge;
    const nw = Math.round(cropW * scale);
    const nh = Math.round(cropH * scale);
    const scaled = document.createElement("canvas");
    scaled.width = nw;
    scaled.height = nh;
    const sctx = scaled.getContext("2d");
    if (!sctx) throw new Error("Could not get canvas context");
    sctx.drawImage(canvas, 0, 0, nw, nh);
    outCanvas = scaled;
  }

  const mimeType = options?.mimeType ?? "image/jpeg";
  const quality = options?.quality ?? 0.92;

  return blobFromCanvas(
    outCanvas,
    mimeType,
    mimeType === "image/jpeg" ? quality : undefined
  );
}
