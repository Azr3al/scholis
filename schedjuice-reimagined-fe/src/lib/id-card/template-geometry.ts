import { ID_CARD_TEMPLATE_DPI, IdCardSlotType } from "@/types/id-card-template";

export function inchesToPx(
  inches: number,
  dpi: number = ID_CARD_TEMPLATE_DPI,
): number {
  return inches * dpi;
}

export function pxToInches(px: number, dpi: number = ID_CARD_TEMPLATE_DPI): number {
  return px / dpi;
}

export function templatePixelSize(
  widthIn: number,
  heightIn: number,
  dpi: number = ID_CARD_TEMPLATE_DPI,
): { width: number; height: number } {
  return {
    width: Math.round(widthIn * dpi),
    height: Math.round(heightIn * dpi),
  };
}

export function editorDisplayScale(
  widthIn: number,
  heightIn: number,
  maxWidth = 420,
  maxHeight = 640,
  dpi: number = ID_CARD_TEMPLATE_DPI,
): number {
  const natural = templatePixelSize(widthIn, heightIn, dpi);
  return Math.min(maxWidth / natural.width, maxHeight / natural.height, 1);
}

export function roundInches(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function pointsToPx(
  points: number,
  dpi: number = ID_CARD_TEMPLATE_DPI,
): number {
  return (points * dpi) / 72;
}

export function formatExpiresOn(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${Number(day)}.${Number(month)}.${year}`;
}

export function normalizeQrSlot<
  T extends { type: IdCardSlotType; width: number; height: number },
>(slot: T): T {
  if (slot.type !== IdCardSlotType.qr) return slot;
  const size = roundInches(Math.max(slot.width, slot.height));
  if (slot.width === size && slot.height === size) return slot;
  return { ...slot, width: size, height: size };
}

export function normalizeQrSlots<
  T extends { type: IdCardSlotType; width: number; height: number },
>(slots: T[]): T[] {
  return slots.map((slot) => normalizeQrSlot(slot));
}

/** Square pixel bounds for a QR slot, centered in its stored rectangle. */
export function resolveSquareSlotRectPx(
  slot: { x: number; y: number; width: number; height: number },
  dpi: number = ID_CARD_TEMPLATE_DPI,
): { x: number; y: number; side: number } {
  const width = inchesToPx(slot.width, dpi);
  const height = inchesToPx(slot.height, dpi);
  const side = Math.max(width, height);
  return {
    x: inchesToPx(slot.x, dpi) + (width - side) / 2,
    y: inchesToPx(slot.y, dpi) + (height - side) / 2,
    side,
  };
}
