import { defaultFontSizePx, fitVariableLayer, normalizeLayer } from "./layer-style";
import type {
  AwardFieldKey,
  AwardDocument,
  BackgroundFill,
  Layer,
} from "./types";

export const IDENTITY_FILL = { offsetX: 0, offsetY: 0, scale: 1 } as const;

const AWARD_PAGE_PRESETS = new Set(["original", "hd_16_9", "a4_landscape", "custom"]);

export function normalizeBackgroundFill(
  url: string | null,
  raw: unknown,
): BackgroundFill {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const offsetX = Number(record.offsetX ?? 0);
  const offsetY = Number(record.offsetY ?? 0);
  const scale = Number(record.scale ?? 1);
  const resolvedUrl =
    typeof record.url === "string" || record.url === null
      ? (record.url as string | null)
      : url;
  return {
    url: resolvedUrl,
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}

export function awardDocumentFromSavedTemplate(saved: {
  document: unknown;
  background_url: string | null;
}): AwardDocument | null {
  const parsed = parseAwardDocument(saved.document);
  if (!parsed) return null;
  return {
    ...parsed,
    background: { ...parsed.background, url: saved.background_url },
  };
}

export function parseAwardDocument(raw: unknown): AwardDocument | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const doc = raw as Record<string, unknown>;
  if (doc.kind !== "award") return null;
  if (!Array.isArray(doc.layers)) return null;
  const preset = doc.pagePreset;
  const pagePreset =
    typeof preset === "string" && AWARD_PAGE_PRESETS.has(preset)
      ? (preset as AwardDocument["pagePreset"])
      : "original";
  const backgroundRaw = doc.background;
  const url =
    backgroundRaw &&
    typeof backgroundRaw === "object" &&
    !Array.isArray(backgroundRaw) &&
    (typeof (backgroundRaw as { url?: unknown }).url === "string" ||
      (backgroundRaw as { url?: unknown }).url === null)
      ? ((backgroundRaw as { url: string | null }).url)
      : null;
  return {
    version: 1,
    kind: "award",
    unit: "px",
    width: Number(doc.width) || 0,
    height: Number(doc.height) || 0,
    pagePreset,
    background: normalizeBackgroundFill(url, backgroundRaw),
    layers: (doc.layers as Layer[]).map((layer) =>
      layer && typeof layer === "object" ? normalizeLayer(layer) : layer,
    ),
  };
}

export function emptyAwardDocument(): AwardDocument {
  return {
    version: 1,
    kind: "award",
    unit: "px",
    width: 0,
    height: 0,
    pagePreset: "original",
    background: { url: null, ...IDENTITY_FILL },
    layers: [],
  };
}

export function createAwardLayer(
  key: string,
  z: number,
  origin?: { x: number; y: number },
): Layer {
  const base = {
    id: `${key}-${Date.now()}`,
    x: origin?.x ?? 40,
    y: origin?.y ?? 40,
    width: 200,
    height: 40,
    z,
  };
  if (key === "text") {
    const fontSize = 40;
    return {
      ...base,
      type: "text",
      text: "Text",
      color: "#111111",
      fontSize,
      height: fontSize * 1.2,
      width: 120,
    };
  }
  if (key === "photo") {
    return {
      ...base,
      type: "photo",
      photoKind: "award_image",
      width: 160,
      height: 200,
      removeBackground: true,
    };
  }
  if (key === "mt_signature") {
    return { ...base, type: "signature", bind: { kind: "mt" }, width: 160, height: 60 };
  }
  if (key === "user_signature") {
    return {
      ...base,
      type: "signature",
      bind: { kind: "user", user_id: 0 },
      width: 160,
      height: 60,
    };
  }
  if (key === "named_person") {
    const fontSize = defaultFontSizePx(base.height);
    return fitVariableLayer({
      ...base,
      type: "named_person",
      user_id: 0,
      fontSize,
      height: fontSize * 1.2,
    });
  }
  const fontSize = defaultFontSizePx(base.height);
  return fitVariableLayer({
    ...base,
    type: "field",
    field: key as AwardFieldKey,
    fontSize,
    height: fontSize * 1.2,
  });
}
