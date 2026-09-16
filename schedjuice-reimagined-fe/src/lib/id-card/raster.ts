import { cardPixelSize, EXPORT_DPI, legacyQrExportPixelSize } from "./dimensions";
import { generateQrDataUrl } from "./qr";
import { renderIdCardTemplateToDataUrl } from "./render-template";
import { renderCardFaceToDataUrl } from "./svg-data-url";
import { buildVerifyUrl } from "./verify-url";
import type { CardViewModel } from "./types";
import type { IdCardTemplateSummary } from "@/types/id-card-template";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function resolveExportOrigin(origin?: string): string {
  if (origin) return origin;
  return typeof window !== "undefined" ? window.location.origin : "";
}

async function resolveExportQrDataUrl(
  vm: CardViewModel,
  qrDataUrl: string,
  dpi: number,
  origin?: string,
): Promise<string> {
  const verifyUrl = buildVerifyUrl(resolveExportOrigin(origin), vm);
  if (!verifyUrl) return qrDataUrl;
  return generateQrDataUrl(verifyUrl, { targetPx: legacyQrExportPixelSize(dpi) });
}

/** Rasterize the card face to a PNG data URL at print resolution. */
export async function cardToPngDataUrl(
  vm: CardViewModel,
  qrDataUrl: string,
  options?: {
    dpi?: number;
    template?: IdCardTemplateSummary | null;
    origin?: string;
  },
): Promise<string> {
  const dpi = options?.dpi ?? EXPORT_DPI;
  const verifyUrl = buildVerifyUrl(resolveExportOrigin(options?.origin), vm);

  if (options?.template) {
    return renderIdCardTemplateToDataUrl({
      template: options.template,
      vm,
      qrDataUrl,
      verifyUrl: verifyUrl || undefined,
      dpi,
    });
  }

  const exportQrDataUrl = await resolveExportQrDataUrl(vm, qrDataUrl, dpi, options?.origin);
  const svgDataUrl = await renderCardFaceToDataUrl(vm, exportQrDataUrl);
  const { width, height } = cardPixelSize(dpi);
  const img = await loadImage(svgDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}
