import { resolveStaticTextSlotValue, resolveTextSlotValue } from "@/lib/id-card/template-field-values";
import { generateQrDataUrl } from "@/lib/id-card/qr";
import {
  ensureIdCardFontsLoaded,
  formatCanvasFont,
  resolveSlotFontFamily,
} from "@/lib/id-card/template-fonts";
import { inchesToPx, pointsToPx, resolveSquareSlotRectPx, templatePixelSize } from "@/lib/id-card/template-geometry";
import { resolveIdCardBackgroundFill } from "@/lib/id-card/resolve-background-fill";
import { backgroundDestRect } from "@/lib/image-template/composite";
import type { CardViewModel } from "@/lib/id-card/types";
import { buildVerifyUrl } from "@/lib/id-card/verify-url";
import {
  IdCardSlotType,
  clampIdCardFontSizePt,
  DEFAULT_ID_CARD_FONT_SIZE_PT,
  ID_CARD_TEMPLATE_DPI,
  IdCardTemplateSide,
  type IdCardPhotoSlot,
  type IdCardTemplateSlot,
  type IdCardTemplateSummary,
  type IdCardTextSlot,
} from "@/types/id-card-template";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  borderRadiusPx = 0,
) {
  const scale = Math.max(width / img.width, height / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = x + (width - drawW) / 2;
  const dy = y + (height - drawH) / 2;
  ctx.save();
  if (borderRadiusPx > 0 && typeof ctx.roundRect === "function") {
    const radius = Math.min(borderRadiusPx, width / 2, height / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.clip();
  } else if (borderRadiusPx > 0) {
    clipRoundedRect(ctx, x, y, width, height, borderRadiusPx);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
  }
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}

function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.clip();
}

function drawTextSlot(
  ctx: CanvasRenderingContext2D,
  slot: Pick<
    IdCardTextSlot,
    | "x"
    | "y"
    | "width"
    | "height"
    | "fontSizePt"
    | "fontFamily"
    | "color"
    | "align"
    | "fontStyle"
  >,
  text: string,
  dpi: number,
) {
  const x = inchesToPx(slot.x, dpi);
  const y = inchesToPx(slot.y, dpi);
  const width = inchesToPx(slot.width, dpi);
  const height = inchesToPx(slot.height, dpi);
  const fontSizePt = clampIdCardFontSizePt(slot.fontSizePt ?? DEFAULT_ID_CARD_FONT_SIZE_PT);
  const fontSizePx = (fontSizePt * dpi) / 72;
  const align = slot.align ?? "center";
  const fontFamily = resolveSlotFontFamily(slot.fontFamily);
  const color = slot.color ?? "#111111";

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = formatCanvasFont(fontSizePx, fontFamily, slot.fontStyle);
  ctx.textAlign = align;
  ctx.textBaseline = "middle";

  let textX = x + width / 2;
  if (align === "left") textX = x;
  if (align === "right") textX = x + width;

  const lines = wrapText(ctx, text, width);
  const lineHeight = fontSizePx * 1.2;
  const totalHeight = lines.length * lineHeight;
  let startY = y + height / 2 - totalHeight / 2 + lineHeight / 2;

  for (const line of lines) {
    ctx.fillText(line, textX, startY, width);
    startY += lineHeight;
  }
  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text.trim()) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = words[0] ?? "";
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i] ?? "";
    }
  }
  lines.push(current);
  return lines;
}

export type RenderIdCardTemplateOptions = {
  template: IdCardTemplateSummary;
  vm: CardViewModel;
  qrDataUrl: string;
  verifyUrl?: string;
  dpi?: number;
  photoUrl?: string | null;
  side?: IdCardTemplateSide;
};

function resolveSideAssets(
  template: IdCardTemplateSummary,
  side: IdCardTemplateSide,
): { backgroundUrl: string | null; slots: IdCardTemplateSlot[] } {
  if (side === IdCardTemplateSide.back) {
    return {
      backgroundUrl: template.back_background_url ?? null,
      slots: template.back_slots ?? [],
    };
  }
  return {
    backgroundUrl: template.background_url,
    slots: template.slots ?? [],
  };
}

export async function renderIdCardTemplateToCanvas(
  options: RenderIdCardTemplateOptions,
): Promise<HTMLCanvasElement> {
  const {
    template,
    vm,
    qrDataUrl: _qrDataUrl,
    verifyUrl,
    dpi = ID_CARD_TEMPLATE_DPI,
    side = IdCardTemplateSide.front,
  } = options;
  const { backgroundUrl, slots } = resolveSideAssets(template, side);
  const { width, height } = templatePixelSize(
    Number(template.width_in),
    Number(template.height_in),
    dpi,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  if (backgroundUrl) {
    try {
      const bg = await loadImage(backgroundUrl);
      const sideKey = side === IdCardTemplateSide.back ? "back" : "front";
      const raw = template.background_transform?.[sideKey] ?? {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
      };
      const pageIn = {
        width: Number(template.width_in),
        height: Number(template.height_in),
      };
      const image = { width: bg.width, height: bg.height };
      const native = resolveIdCardBackgroundFill(
        backgroundUrl,
        raw,
        image,
        pageIn,
      );
      const rect = backgroundDestRect(
        {
          url: backgroundUrl,
          offsetX: native.offsetX * dpi,
          offsetY: native.offsetY * dpi,
          scale: native.scale * dpi,
        },
        image,
        { width, height },
      );
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();
      ctx.drawImage(bg, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    } catch {
      // Fall back to white fill when the template background is unreachable.
    }
  }

  const photoUrl = options.photoUrl ?? vm.photoUrl;
  const resolvedVerifyUrl =
    verifyUrl ??
    buildVerifyUrl(
      typeof window !== "undefined" ? window.location.origin : "",
      vm,
    );

  await ensureIdCardFontsLoaded(slots, dpi);

  for (const slot of slots as IdCardTemplateSlot[]) {
    const x = inchesToPx(slot.x, dpi);
    const y = inchesToPx(slot.y, dpi);
    const slotWidth = inchesToPx(slot.width, dpi);
    const slotHeight = inchesToPx(slot.height, dpi);

    if (slot.type === IdCardSlotType.photo && photoUrl) {
      try {
        const photo = await loadImage(photoUrl);
        const photoSlot = slot as IdCardPhotoSlot;
        const borderRadiusPx = pointsToPx(photoSlot.borderRadiusPt ?? 0, dpi);
        drawImageCover(ctx, photo, x, y, slotWidth, slotHeight, borderRadiusPx);
      } catch {
        // Skip broken photo URLs during bulk export.
      }
    } else if (slot.type === IdCardSlotType.qr) {
      try {
        const { x: qrX, y: qrY, side } = resolveSquareSlotRectPx(slot, dpi);
        const targetPx = Math.max(1, Math.round(side));
        const qrPayload =
          resolvedVerifyUrl || "https://example.com/verify/sample";
        const qrSrc = await generateQrDataUrl(qrPayload, { targetPx });
        if (!qrSrc) continue;
        const qr = await loadImage(qrSrc);
        const drawSide = Math.min(
          targetPx,
          qr.naturalWidth,
          qr.naturalHeight,
        );
        const offsetX = qrX + (side - drawSide) / 2;
        const offsetY = qrY + (side - drawSide) / 2;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qr, 0, 0, drawSide, drawSide, offsetX, offsetY, drawSide, drawSide);
        ctx.restore();
      } catch {
        // Skip broken QR during export.
      }
    } else if (slot.type === IdCardSlotType.text) {
      const text = resolveTextSlotValue(slot, vm, template);
      if (text) drawTextSlot(ctx, slot, text, dpi);
    } else if (slot.type === IdCardSlotType.staticText) {
      const text = resolveStaticTextSlotValue(slot);
      if (text) drawTextSlot(ctx, slot, text, dpi);
    }
  }

  return canvas;
}

export async function renderIdCardTemplateToDataUrl(
  options: RenderIdCardTemplateOptions,
): Promise<string> {
  const canvas = await renderIdCardTemplateToCanvas(options);
  return canvas.toDataURL("image/png");
}
