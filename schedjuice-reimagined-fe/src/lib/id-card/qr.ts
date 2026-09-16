import QRCode from "qrcode";

const PREVIEW_TARGET_PX = 512;

export type GenerateQrOptions = {
  /** Max square output dimension; scale is chosen so output fits within this. */
  targetPx?: number;
  /** Explicit pixels per module (integer); overrides targetPx when set. */
  scale?: number;
  errorCorrectionLevel?: "M" | "Q";
  margin?: number;
};

export function qrRenderedPixelSize(
  moduleCount: number,
  margin: number,
  scale: number,
): number {
  return (moduleCount + margin * 2) * scale;
}

function resolveQrScale(
  data: string,
  options?: GenerateQrOptions,
): { scale: number; margin: number; errorCorrectionLevel: "M" | "Q" } {
  const margin = options?.margin ?? 4;
  const errorCorrectionLevel = options?.errorCorrectionLevel ?? "Q";

  if (options?.scale != null) {
    return {
      scale: Math.max(1, Math.floor(options.scale)),
      margin,
      errorCorrectionLevel,
    };
  }

  const qr = QRCode.create(data, { errorCorrectionLevel });
  const totalModules = qr.modules.size + margin * 2;
  const targetPx = options?.targetPx ?? PREVIEW_TARGET_PX;
  const scale = Math.max(1, Math.floor(targetPx / totalModules));

  return { scale, margin, errorCorrectionLevel };
}

export async function generateQrDataUrl(
  data: string,
  options?: GenerateQrOptions,
): Promise<string> {
  if (!data) return "";
  const { scale, margin, errorCorrectionLevel } = resolveQrScale(data, options);
  return QRCode.toDataURL(data, {
    errorCorrectionLevel,
    margin,
    scale,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}
