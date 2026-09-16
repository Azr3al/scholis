import { inlineImageToDataUrl } from "./svg-data-url";

const MAX_SAMPLE_SIZE = 64;
const MIN_ALPHA = 200;
const NEAR_WHITE = 240;

function quantizeChannel(channel: number): number {
  return Math.min(255, Math.round(channel / 16) * 16);
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** Pick the dominant opaque color from RGBA pixel data (testable without canvas). */
export function mostFrequentColor(pixels: Uint8ClampedArray): string | null {
  const counts = new Map<string, number>();

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const a = pixels[i + 3]!;

    if (a < MIN_ALPHA) continue;
    if (r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE) continue;

    const qr = quantizeChannel(r);
    const qg = quantizeChannel(g);
    const qb = quantizeChannel(b);
    const key = `${qr},${qg},${qb}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of Array.from(counts.entries())) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }

  if (!bestKey) return null;
  const [r, g, b] = bestKey.split(",").map(Number);
  return toHex(r!, g!, b!);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/** Sample the dominant brand color from a logo URL for accent suggestions. */
export async function extractLogoColor(url: string | null): Promise<string | null> {
  if (!url) return null;

  const dataUrl = await inlineImageToDataUrl(url);
  if (!dataUrl) return null;

  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_SAMPLE_SIZE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return mostFrequentColor(data);
  } catch {
    return null;
  }
}
