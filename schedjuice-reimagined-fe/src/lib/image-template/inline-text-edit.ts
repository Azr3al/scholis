import type { Hit } from "./hit-test";
import { isTextLike } from "./layer-style";
import type { Layer } from "./types";

export function editableTextLayerId(
  hit: Hit | undefined,
  layers: Layer[],
): string | null {
  if (hit?.kind !== "layer") return null;
  const layer = layers.find((item) => item.id === hit.layerId);
  return layer && isTextLike(layer) ? layer.id : null;
}
