import { defaultFontSizePt } from "./layer-style";
import type { IdCardFieldKey, Layer } from "./types";

export function createIdCardLayer(
  key: string,
  z: number,
  origin?: { x: number; y: number },
): Layer {
  const base = { id: `${key}-${Date.now()}`, x: 0.2, y: 0.5, width: 1.7, height: 0.25, z };
  let layer: Layer;
  if (key === "photo") {
    layer = {
      ...base,
      type: "photo",
      photoKind: "id_image",
      width: 0.9,
      height: 1.1,
      x: 0.55,
      y: 0.85,
      removeBackground: false,
    };
  } else if (key === "qr") {
    layer = { ...base, type: "qr", width: 0.7, height: 0.7, x: 1.2, y: 2.55 };
  } else if (key === "text") {
    const fontSize = 16;
    layer = {
      ...base,
      type: "text",
      text: "Your text",
      color: "#111111",
      fontSize,
      height: (fontSize * 1.2) / 72,
    };
  } else {
    layer = {
      ...base,
      type: "field",
      field: key as IdCardFieldKey,
      fontSize: defaultFontSizePt(base.height),
    };
  }
  return origin ? { ...layer, x: origin.x, y: origin.y } : layer;
}
