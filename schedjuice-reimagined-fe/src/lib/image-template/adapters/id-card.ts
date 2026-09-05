import { normalizeBackgroundFill } from "../award-document";
import { normalizeLayer } from "../layer-style";
import { MalformedTemplateError } from "../malformed-template-error";
import type {
  FieldLayer,
  IdCardDocument,
  IdCardFieldKey,
  Layer,
  PhotoLayer,
  QrLayer,
  TextLayer,
} from "../types";

const ID_FIELDS = new Set<IdCardFieldKey>([
  "name",
  "class",
  "course_title",
  "registration",
  "academic_year",
  "expires",
]);

type RawSlot = Record<string, unknown>;

function isRecord(value: unknown): value is RawSlot {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slotBase(slot: RawSlot, fallbackId: string, z: number) {
  return {
    id: String(slot.id ?? fallbackId),
    x: Number(slot.x ?? 0),
    y: Number(slot.y ?? 0),
    width: Number(slot.width ?? 1),
    height: Number(slot.height ?? 0.25),
    z,
  };
}

function parseSlotFontStyle(value: unknown): "bold" | "normal" | undefined {
  if (value === "bold" || value === "normal") return value;
  return undefined;
}

function slotFontStylePayload(fontStyle?: "bold" | "italic" | "normal"): RawSlot {
  return fontStyle === "bold" ? { fontStyle: "bold" } : {};
}

function slotToLayer(slot: unknown, index: number): Layer {
  if (!isRecord(slot) || typeof slot.type !== "string") {
    throw new MalformedTemplateError();
  }
  const base = slotBase(slot, `slot-${index}`, index);
  if (slot.type === "photo") {
    const photo: PhotoLayer = {
      ...base,
      type: "photo",
      photoKind: "id_image",
      borderRadiusPt:
        slot.borderRadiusPt != null ? Number(slot.borderRadiusPt) : undefined,
      removeBackground: slot.removeBackground === true,
    };
    return normalizeLayer(photo);
  }
  if (slot.type === "qr") {
    const qr: QrLayer = { ...base, type: "qr" };
    return qr;
  }
  if (slot.type === "static_text") {
    const text: TextLayer = {
      ...base,
      type: "text",
      text: String(slot.text ?? ""),
      fontSize: slot.fontSizePt != null ? Number(slot.fontSizePt) : undefined,
      fontFamily: typeof slot.fontFamily === "string" ? slot.fontFamily : undefined,
      color: typeof slot.color === "string" ? slot.color : undefined,
      align:
        slot.align === "left" || slot.align === "right" || slot.align === "center"
          ? slot.align
          : undefined,
      bold: slot.bold === true,
      italic: slot.italic === true,
      underline: slot.underline === true,
      fontStyle:
        parseSlotFontStyle(slot.fontStyle) ??
        (slot.fontStyle === "italic" ? "italic" : undefined),
    };
    return normalizeLayer(text);
  }
  if (slot.type === "text") {
    const field = slot.field;
    if (typeof field !== "string" || !ID_FIELDS.has(field as IdCardFieldKey)) {
      throw new MalformedTemplateError();
    }
    const textField: FieldLayer = {
      ...base,
      type: "field",
      field: field as IdCardFieldKey,
      fontSize: slot.fontSizePt != null ? Number(slot.fontSizePt) : undefined,
      fontFamily: typeof slot.fontFamily === "string" ? slot.fontFamily : undefined,
      color: typeof slot.color === "string" ? slot.color : undefined,
      align:
        slot.align === "left" || slot.align === "right" || slot.align === "center"
          ? slot.align
          : undefined,
      bold: slot.bold === true,
      italic: slot.italic === true,
      underline: slot.underline === true,
      fontStyle:
        parseSlotFontStyle(slot.fontStyle) ??
        (slot.fontStyle === "italic" ? "italic" : undefined),
    };
    return normalizeLayer(textField);
  }
  throw new MalformedTemplateError();
}

function layerToSlot(layer: Layer): RawSlot {
  const base = {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
  };
  if (layer.type === "photo") {
    return {
      ...base,
      type: "photo",
      ...(layer.borderRadiusPt != null
        ? { borderRadiusPt: layer.borderRadiusPt }
        : {}),
      ...(layer.removeBackground ? { removeBackground: true } : {}),
    };
  }
  if (layer.type === "qr") {
    return { ...base, type: "qr" };
  }
  if (layer.type === "text") {
    return {
      ...base,
      type: "static_text",
      text: layer.text,
      ...(layer.fontSize != null ? { fontSizePt: layer.fontSize } : {}),
      ...(layer.fontFamily ? { fontFamily: layer.fontFamily } : {}),
      ...(layer.color ? { color: layer.color } : {}),
      ...(layer.align ? { align: layer.align } : {}),
      ...(layer.bold ? { bold: true } : {}),
      ...(layer.italic ? { italic: true } : {}),
      ...(layer.underline ? { underline: true } : {}),
      ...slotFontStylePayload(layer.fontStyle),
    };
  }
  if (layer.type === "field") {
    return {
      ...base,
      type: "text",
      field: layer.field,
      ...(layer.fontSize != null ? { fontSizePt: layer.fontSize } : {}),
      ...(layer.fontFamily ? { fontFamily: layer.fontFamily } : {}),
      ...(layer.color ? { color: layer.color } : {}),
      ...(layer.align ? { align: layer.align } : {}),
      ...(layer.bold ? { bold: true } : {}),
      ...(layer.italic ? { italic: true } : {}),
      ...(layer.underline ? { underline: true } : {}),
      ...slotFontStylePayload(layer.fontStyle),
    };
  }
  throw new MalformedTemplateError();
}

export function idCardTemplateToDocument(template: {
  width_in: number | string;
  height_in: number | string;
  background_url: string | null;
  slots: unknown[];
  back_background_url?: string | null;
  back_slots?: unknown[];
  background_transform?: {
    front?: unknown;
    back?: unknown;
  };
}): IdCardDocument {
  if (!Array.isArray(template.slots)) {
    throw new MalformedTemplateError();
  }
  const backSlots = template.back_slots ?? [];
  if (!Array.isArray(backSlots)) {
    throw new MalformedTemplateError();
  }
  const widthIn = Number(template.width_in);
  const heightIn = Number(template.height_in);
  return {
    version: 1,
    kind: "id_card",
    unit: "in",
    width: widthIn,
    height: heightIn,
    dpi: 300,
    pagePreset:
      widthIn > heightIn ? "id_cr80_landscape" : "id_cr80_portrait",
    background: {
      front: normalizeBackgroundFill(
        template.background_url,
        template.background_transform?.front,
      ),
      back: normalizeBackgroundFill(
        template.back_background_url ?? null,
        template.background_transform?.back,
      ),
    },
    faces: {
      front: template.slots.map(slotToLayer),
      back: backSlots.map(slotToLayer),
    },
  };
}

export function documentToIdCardPayload(doc: IdCardDocument): {
  slots: unknown[];
  back_slots: unknown[];
  background_transform: {
    front: { offsetX: number; offsetY: number; scale: number };
    back: { offsetX: number; offsetY: number; scale: number };
  };
} {
  return {
    slots: doc.faces.front.map(layerToSlot),
    back_slots: doc.faces.back.map(layerToSlot),
    background_transform: {
      front: {
        offsetX: doc.background.front.offsetX,
        offsetY: doc.background.front.offsetY,
        scale: doc.background.front.scale,
      },
      back: {
        offsetX: doc.background.back.offsetX,
        offsetY: doc.background.back.offsetY,
        scale: doc.background.back.scale,
      },
    },
  };
}

export function documentToIdCardSlots(doc: IdCardDocument): {
  slots: unknown[];
  back_slots: unknown[];
} {
  const payload = documentToIdCardPayload(doc);
  return { slots: payload.slots, back_slots: payload.back_slots };
}
