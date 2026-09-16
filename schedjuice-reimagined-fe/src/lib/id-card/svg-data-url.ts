import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { IdCardFace } from "@/components/id-card/id-card-face";
import {
  imageProxyUrl,
  isAllowedImageUrl,
  toAbsoluteImageUrl,
} from "./image-proxy";
import type { CardViewModel } from "./types";

/** Encode raw SVG markup as a texture-safe data URL (no btoa → unicode safe). */
export function svgStringToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fetchImageBlob(fetchUrl: string): Promise<Blob | null> {
  try {
    const res = await fetch(fetchUrl, { mode: "cors" });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Fetch a remote image and return it as a data URL. Browsers block external
 * resources when an SVG is rendered as an image (for textures/raster export),
 * so the photo + logo must be inlined first.
 */
export async function inlineImageToDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;

  const origin =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const absoluteUrl = toAbsoluteImageUrl(url, origin);
  if (!absoluteUrl) return null;

  let blob = await fetchImageBlob(absoluteUrl);
  if (!blob && isAllowedImageUrl(absoluteUrl)) {
    blob = await fetchImageBlob(imageProxyUrl(absoluteUrl));
  }
  if (!blob) return null;

  try {
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/** Render the card face to a self-contained data URL for WebGL textures and export. */
export async function renderCardFaceToDataUrl(
  vm: CardViewModel,
  qrDataUrl: string,
): Promise<string> {
  const [photoUrl, orgLogoUrl] = await Promise.all([
    inlineImageToDataUrl(vm.photoUrl),
    inlineImageToDataUrl(vm.orgLogoUrl),
  ]);
  const inlineVm: CardViewModel = { ...vm, photoUrl, orgLogoUrl };
  const svg = renderToStaticMarkup(
    createElement(IdCardFace, { vm: inlineVm, qrDataUrl, width: 540 }),
  );
  return svgStringToDataUrl(svg);
}
